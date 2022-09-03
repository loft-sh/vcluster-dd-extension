import {v1} from "@docker/extension-api-client-types";
import {CurrentExtensionContext, DockerDesktop, IsK8sEnabled} from "./constants";
import {Context, getVClusterContextName, isVclusterContext} from "./util";

// docker-desktop commands
// Common function to call host.cli.exec
const hostCli = async (ddClient: v1.DockerDesktopClient, command: string, args: string[]) => {
    return ddClient.extension.host?.cli.exec(command, args);
}

// store values in docker-desktop rest service
const storeValuesFileInContainer = async (ddClient: v1.DockerDesktopClient, values: string) => {
    return ddClient.extension.vm?.service?.post("/store-values", {data: values});
}

// vcluster commands
// Create vcluster on kubernetes
export const createVCluster = async (ddClient: v1.DockerDesktopClient, name: string,
                                     namespace: string, distro: string, chartVersion: string,
                                     values: string, isUpgrade?: boolean) => {
    // vcluster create name -n namespace --distro k3s --chart-version 0.9.1 --values string --context extensionContext
    let args = ["create", name];

    if (namespace) {
        args.push("--namespace");
        args.push(namespace);
    }
    if (distro) {
        args.push("--distro");
        args.push(distro);
    }
    if (chartVersion) {
        args.push("--chart-version");
        args.push(chartVersion);
    }
    if (values) {
        // call backend to store the values
        try {
            let fileName = await storeValuesFileInContainer(ddClient, values);
            args.push("--extra-values");
            args.push(JSON.stringify(fileName));
        } catch (err) {
            console.log("error", JSON.stringify(err));
        }
    }
    args.push("--connect=false");
    args.push("--context", getExtensionContext())
    if (isUpgrade) {
        args.push("--upgrade")
    }

    let output = await hostCli(ddClient, "vcluster", args);

    if (output?.stderr) {
        console.log("[createVClusters] : ", output.stderr);
        return false;
    }
    return true;
}

// Retrieves all the vclusters from specified kubernetes
export const listVClusters = async (ddClient: v1.DockerDesktopClient) => {
    // vcluster list --output json --context extensionContext
    let output = await hostCli(ddClient, "vcluster", ["list", "--output", "json", "--context", getExtensionContext()]);
    if (output?.stderr) {
        console.log("[listVClusters] : ", output.stderr)
        return [];
    }
    return JSON.parse(output?.stdout || "[]");
}

// Deletes the vcluster
export const deleteVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string) => {
    // vcluster delete name -n namespace --context extensionContext
    let output = await hostCli(ddClient, "vcluster", ["delete", name, "-n", namespace, "--context", getExtensionContext()]);
    if (output?.stderr) {
        console.log("[deleteVCluster] : ", output.stderr);
        return false;
    }
    const contextName = getVClusterContextName(name, namespace)
    try {
        const result = await Promise.all([
            hostCli(ddClient, "kubectl", ["config", "unset", "users." + contextName]),
            hostCli(ddClient, "kubectl", ["config", "unset", "contexts." + contextName]),
            hostCli(ddClient, "kubectl", ["config", "unset", "clusters." + contextName])]);
        console.log(result)
    } catch (err) {
        console.log(err);
    }
    return true;
}

// Resumes the vcluster
export const resumeVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string) => {
    // vcluster resume name -n namespace --context extensionContext
    let output = await hostCli(ddClient, "vcluster", ["resume", name, "-n", namespace, "--context", getExtensionContext()]);
    if (output?.stderr) {
        console.log("[resumeVCluster] : ", output.stderr);
        return false;
    }
    return true;
}

// Pauses the vcluster
export const pauseVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string) => {
    // vcluster pause name -n namespace --context extensionContext
    let output = await hostCli(ddClient, "vcluster", ["pause", name, "-n", namespace, "--context", getExtensionContext()]);
    if (output?.stderr) {
        console.log("[pauseVCluster] : ", output.stderr);
        return false;
    }
    return true;
}

// Runs `vcluster disconnect` command on host and changes the context back to older context.
export const disconnectVCluster = async (ddClient: v1.DockerDesktopClient, namespace: string) => {
    // vcluster disconnect --namespace namespace
    const disconnect = await hostCli(ddClient, "vcluster", ["disconnect", "-n", namespace])
    if (disconnect?.stderr) {
        console.log("[disconnectVCluster] : ", disconnect.stderr);
        return false;
    }

    return true;
}

// Runs `vcluster connect` command on host and changes the context is changed internally.
export const connectVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string) => {
    const nodePortService = await isNodePortServiceAvailableForVcluster(ddClient, name, namespace)
    if (!nodePortService) {
        // vcluster connect name -n namespace --background-proxy --context extensionContext
        const connect = await hostCli(ddClient, "vcluster", ["connect", name, "-n", namespace, "--background-proxy", "--context", getExtensionContext()]);
        if (connect?.stderr) {
            console.log("[connectVCluster] : ", connect.stderr);
            return false;
        }
        return true;
    } else {
        // vcluster connect name -n namespace --context extensionContext
        const connect = await hostCli(ddClient, "vcluster", ["connect", name, "-n", namespace, "--context", getExtensionContext()]);
        if (connect?.stderr) {
            console.log("[connectVCluster] : ", connect.stderr);
            return false;
        }
        return true;
    }
}
// localstorage commands
// set context on extension container
export const setExtensionContext = async (ddClient: v1.DockerDesktopClient, context: string) => {
    // update current extension context using localstorage
    localStorage.setItem(CurrentExtensionContext, context);
}

// Change context on extension container
export const getExtensionContext = () => {
    // retrieve extension current context
    return localStorage.getItem(CurrentExtensionContext) || DockerDesktop;
}

// kubectl commands
// Lists all namespaces from connected kubernetes cluster
export const listNamespaces = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl get ns --no-headers -o custom-columns=":metadata.name" --context extensionContext
    let output = await hostCli(ddClient, "kubectl", ["get", "namespaces", "--no-headers", "-o", "custom-columns=\":metadata.name\"", "--context", getExtensionContext()]);
    if (output?.stderr) {
        console.log("[listNamespaces] : ", output.stderr);
        return [];
    }

    const nsNameList: string[] = []
    output?.stdout.split("\n").forEach((namespace: string) => {
        const trimmed = namespace.trim();
        if (trimmed) {
            nsNameList.push(trimmed);
        }
    });
    return nsNameList;
}

// Lists all services from connected kubernetes cluster
export const listNodePortServices = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl get svc -A --no-headers -o custom-columns=":metadata.name, :metadata.namespace, :spec.type"  | grep NodePort
    let output = await hostCli(ddClient, "kubectl", ["get", "services", "-A", "--no-headers", "--context", getExtensionContext(), "-o", "custom-columns=\":metadata.name, :metadata.namespace, :spec.type\"", "|", "grep", "NodePort"]);
    if (output?.stderr) {
        console.log("[listServices] : ", output.stderr);
        return [];
    }

    interface SvcObject {
        name: string;
        namespace: string;
        type: string;
    }

    const svcObjects: SvcObject[] = []
    output?.stdout.split("\n").forEach((svc: string) => {
        const trimmed = svc.trim();
        if (trimmed) {
            const splitted = trimmed.split(" ").filter(entry => entry !== "")
            if (splitted.length === 3) {
                let svcObject: SvcObject = {
                    name: splitted[0].trim(),
                    namespace: splitted[1].trim(),
                    type: splitted[2].trim()
                }
                svcObjects.push(svcObject);
            }
        }
    });
    return svcObjects;
}

export const isNodePortServiceAvailableForVcluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string) => {
    let nodePortServices = await listNodePortServices(ddClient);
    if (nodePortServices.length > 0) {
        let found = nodePortServices.filter(nodePortService => {
            return nodePortService.name === name && nodePortService.namespace === namespace;
        });
        if (found.length > 0) {
            return true;
        }
    }
    return false;
}

// Lists all contexts from host
export const listHostContexts = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl config view -o jsonpath='{.contexts}'
    let output = await hostCli(ddClient, "kubectl", ["config", "view", "-o", "jsonpath='{.contexts}'"]);
    if (output?.stderr) {
        console.log("[listHostContexts] : ", output.stderr);
        return [];
    }

    const ctxNameList: string[] = []

    if (output) {
        const contexts = JSON.parse(output.stdout)
        contexts.forEach((context: Context) => {
            let vclusterContext = isVclusterContext(context.name, contexts);
            if (!vclusterContext) {
                ctxNameList.push(context.name);
            }
        });
    }
    return ctxNameList;
}

// Retrieves host's current k8s context
export const getCurrentHostContext = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl config view -o jsonpath='{.current-context}'
    let output = await hostCli(ddClient, "kubectl", ["config", "view", "-o", "jsonpath='{.current-context}'"]);
    if (output?.stderr) {
        console.log("[getCurrentHostContext] : ", output.stderr);
        return {};
    }
    return output?.stdout;
}

// Retrieves `kubectl cluster-info` context-wise
export const checkK8sConnection = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl cluster-info --context context-name
    try {
        let output = await hostCli(ddClient, "kubectl", ["cluster-info", "--request-timeout", "2s", "--context", getExtensionContext()]);
        if (output?.stderr) {
            console.log("[checkK8sConnection] : ", output.stderr);
            localStorage.setItem(IsK8sEnabled, "false")
            return false;
        }
        if (output?.stdout) {
            console.log("[checkK8sConnection] : ", output?.stdout)
        }
        localStorage.setItem(IsK8sEnabled, "true")
        return true
    } catch (e: any) {
        console.log("[checkK8sConnection] error : ", e)
        localStorage.setItem(IsK8sEnabled, "false")
        return false
    }
}