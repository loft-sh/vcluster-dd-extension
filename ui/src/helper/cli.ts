import {v1} from "@docker/extension-api-client-types";
import {CurrentExtensionContext, DockerDesktop} from "./constants";

// Common function to call host.cli.exec
const hostCli = async (ddClient: v1.DockerDesktopClient, command: string, args: string[]) => {
    return ddClient.extension.host?.cli.exec(command, args);
}

const storeValuesFileInContainer = async (ddClient: v1.DockerDesktopClient, values: string) => {
    return ddClient.extension.vm?.service?.post("/store-values", {data: values});
}

// check if the context is of vcluster
const isVclusterContext = (originalContext: string, contexts: Context[]) => {
    const splitted = originalContext.split("_")
    if (splitted.length < 4) {
        return false
    }

    let context = splitted.slice(3).join("-");
    if (contexts.filter(e => e.name === context).length > 0) {
        return originalContext.startsWith("vcluster_")
    }
    return false
}

// Retrieves all the vclusters from specified kubernetes
export const listVClusters = async (ddClient: v1.DockerDesktopClient) => {
    // vcluster list --output json
    let output = await hostCli(ddClient, "vcluster", ["list", "--output", "json", "--context", getExtensionContext()]);
    if (output?.stderr) {
        console.log("[listVClusters] : ", output.stderr)
        return [];
    }
    return JSON.parse(output?.stdout || "[]");
}

// Create vcluster on kubernetes
export const createVCluster = async (ddClient: v1.DockerDesktopClient, name: string,
                                     namespace: string, distro: string, chartVersion: string,
                                     values: string, isUpgrade?: boolean) => {
    // vcluster create name -n namespace --distro k3s --chart-version 0.9.1 --values string
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

// Resumes the vcluster
export const resumeVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string) => {
    // vcluster resume cluster-2 -n vcluster-dev
    let output = await hostCli(ddClient, "vcluster", ["resume", name, "-n", namespace, "--context", getExtensionContext()]);
    if (output?.stderr) {
        console.log("[resumeVCluster] : ", output.stderr);
        return false;
    }
    return true;
}

// Pauses the vcluster
export const pauseVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string) => {
    // vcluster pause cluster-2 -n vcluster-dev
    let output = await hostCli(ddClient, "vcluster", ["pause", name, "-n", namespace, "--context", getExtensionContext()]);
    if (output?.stderr) {
        console.log("[pauseVCluster] : ", output.stderr);
        return false;
    }
    return true;
}

// Deletes the vcluster
export const deleteVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string) => {
    // vcluster delete name -n namespace
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

const getVClusterContextName = (vClusterName: string, vClusterNamespace: string) => {
    return "vcluster_" + vClusterName + "_" + vClusterNamespace + "_" + getExtensionContext()
}

// Lists all namespaces from docker-desktop kubernetes
export const listNamespaces = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl get ns --no-headers -o custom-columns=":metadata.name --context extension context"
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

// Lists all services from docker-desktop kubernetes
export const listNodePortServices = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl get svc -A --no-headers -o custom-columns=":metadata.name, :metadata.namespace, :spec.type"  | grep NodePort
    let output = await hostCli(ddClient, "kubectl", ["get", "services", "-A", "--no-headers", "-o", "custom-columns=\":metadata.name, :metadata.namespace, :spec.type\"", "|", "grep", "NodePort"]);
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

// Runs `vcluster disconnect` command on host and changes the context back to older context.
export const disconnectVCluster = async (ddClient: v1.DockerDesktopClient, namespace: string) => {
    // vcluster disconnect --namespace namespace --context context
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
        // vcluster connect name -n namespace --background-proxy
        const connect = await hostCli(ddClient, "vcluster", ["connect", name, "-n", namespace, "--background-proxy"]);
        if (connect?.stderr) {
            console.log("[connectVCluster] : ", connect.stderr);
            return false;
        }
        return true;
    } else {
        // vcluster connect name -n namespace
        const connect = await hostCli(ddClient, "vcluster", ["connect", name, "-n", namespace, "--context", getExtensionContext()]);
        if (connect?.stderr) {
            console.log("[connectVCluster] : ", connect.stderr);
            return false;
        }
        return true;
    }
}

interface ContextDetails {
    cluster: string,
    user: string
}

interface Context {
    name: string,
    context: ContextDetails
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

// Change context on extension container
export const changeExtensionContext = async (ddClient: v1.DockerDesktopClient, context: string) => {
    // update current extension context using localstorage
    localStorage.setItem(CurrentExtensionContext, context);
}

// Change context on extension container
export const getExtensionContext = () => {
    // retrieve extension current context
    return localStorage.getItem(CurrentExtensionContext) || DockerDesktop;
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
    // "--request-timeout", "500s",
    try {
        let output = await hostCli(ddClient, "kubectl", ["cluster-info", "--context", getExtensionContext()]);
        if (output?.stderr) {
            console.log("[checkK8sConnection] : ", output.stderr);
            return false;
        }
        if (output?.stdout) {
            console.log("[checkK8sConnection] : ", output?.stdout)
        }
        return true
    } catch (e) {
        console.log("[checkK8sConnection] error : ", e)
        return false
    }
}