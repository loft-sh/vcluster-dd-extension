import {v1} from "@docker/extension-api-client-types";

// Common function to call vm.cli.exec
const cli = async (ddClient: v1.DockerDesktopClient, command: string, args: string[]) => {
    return ddClient.extension.vm?.cli.exec(command, args);
}

// Common function to call host.cli.exec
const hostCli = async (ddClient: v1.DockerDesktopClient, command: string, args: string[]) => {
    return ddClient.extension.host?.cli.exec(command, args);
}

const storeValuesFileInContainer = async (ddClient: v1.DockerDesktopClient, values: string) => {
    return ddClient.extension.vm?.service?.post("/store-values", {data: values});
}

// Retrieves all the vclusters from docker-desktop kubernetes
export const listVClusters = async (ddClient: v1.DockerDesktopClient) => {
    // vcluster list --output json
    let output = await cli(ddClient, "vcluster", ["list", "--output", "json"]);
    if (output?.stderr) {
        console.log("[listVClusters] : ", output.stderr)
        return [];
    }
    return JSON.parse(output?.stdout || "[]");
}

// Create vcluster on docker-desktop kubernetes
export const createVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string, distro: string, chartVersion: string, values: string, context: string, isUpgrade?: boolean) => {
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
    args.push("--context", context)
    if (isUpgrade) {
        args.push("--upgrade")
    }

    let output = await cli(ddClient, "vcluster", args);

    if (output?.stderr) {
        console.log("[createVClusters] : ", output.stderr);
        return false;
    }
    return true;
}

// Resumes the vcluster
export const resumeVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string, context: string) => {
    // vcluster resume cluster-2 -n vcluster-dev
    let output = await cli(ddClient, "vcluster", ["resume", name, "-n", namespace, "--context", context]);
    if (output?.stderr) {
        console.log("[resumeVCluster] : ", output.stderr);
        return false;
    }
    return true;
}

// Pauses the vcluster
export const pauseVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string, context: string) => {
    // vcluster pause cluster-2 -n vcluster-dev
    let output = await cli(ddClient, "vcluster", ["pause", name, "-n", namespace, "--context", context]);
    if (output?.stderr) {
        console.log("[pauseVCluster] : ", output.stderr);
        return false;
    }
    return true;
}

// Deletes the vcluster
export const deleteVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string, context: string) => {
    // vcluster delete name -n namespace
    let output = await cli(ddClient, "vcluster", ["delete", name, "-n", namespace]);
    if (output?.stderr) {
        console.log("[deleteVCluster] : ", output.stderr);
        return false;
    }
    const contextName = getVClusterContextName(name, namespace, context)
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

const getVClusterContextName = (vClusterName: string, vClusterNamespace: string, currentContext: string) => {
    return "vcluster_" + vClusterName + "_" + vClusterNamespace + "_" + currentContext
}

// Lists all namespaces from docker-desktop kubernetes
export const listNamespaces = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl get ns --no-headers -o custom-columns=":metadata.name"
    let output = await cli(ddClient, "kubectl", ["get", "namespaces", "--no-headers", "-o", "custom-columns=\":metadata.name\""]);
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
    let output = await cli(ddClient, "kubectl", ["get", "services", "-A", "--no-headers", "-o", "custom-columns=\":metadata.name, :metadata.namespace, :spec.type\"", "|", "grep", "NodePort"]);
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
// noinspection JSUnusedLocalSymbols
export const disconnectVCluster = async (ddClient: v1.DockerDesktopClient, namespace: string, context: string) => {
    // vcluster disconnect --namespace namespace --context context
    const disconnect = await hostCli(ddClient, "vcluster", ["disconnect", "-n", namespace, "--context", context])
    if (disconnect?.stderr) {
        console.log("[disconnectVCluster] : ", disconnect.stderr);
        return false;
    }

    return true;
}

// Runs `vcluster connect` command on host and changes the context is changed internally.
export const connectVCluster = async (ddClient: v1.DockerDesktopClient, name: string, namespace: string, context: string) => {
    const nodePortService = await isNodePortServiceAvailableForVcluster(ddClient, name, namespace)
    if (!nodePortService) {
        // vcluster connect name -n namespace --background-proxy
        const connect = await cli(ddClient, "vcluster", ["connect", name, "-n", namespace, "--background-proxy", "--context", context]);
        if (connect?.stderr) {
            console.log("[connectVCluster] : ", connect.stderr);
            return false;
        }
        return true;
    } else {
        // vcluster connect name -n namespace
        const connect = await hostCli(ddClient, "vcluster", ["connect", name, "-n", namespace, "--context", context]);
        if (connect?.stderr) {
            console.log("[connectVCluster] : ", connect.stderr);
            return false;
        }
        return true;
    }
}

// Gets kubeconfig file from local and save it in container's /root/.kube/config file-system.
// We have to use the vm.service to call the post api to store the kubeconfig retrieved. Without post api in vm.service
// all the combinations of commands fail
export const listHostContexts = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl config view --raw
    let kubeConfig = await hostCli(ddClient, "kubectl", ["config", "view", "--raw"]);
    if (kubeConfig?.stderr) {
        console.log("[listHostContexts] : ", kubeConfig?.stderr);
        return false;
    }

    // call backend to store the kubeconfig retrieved
    try {
        await ddClient.extension.vm?.service?.post("/store-kube-config", {data: kubeConfig?.stdout})
    } catch (err) {
        console.log("error while posting kubeconfig to server", JSON.stringify(err));
    }
    try {
        let output = await checkK8sConnection(ddClient);
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

// Lists all contexts from extension
export const listExtensionContexts = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl config view -o jsonpath='{.contexts}'
    let output = await cli(ddClient, "kubectl", ["config", "view", "-o", "jsonpath='{.contexts}'"]);
    if (output?.stderr) {
        console.log("[listExtensionContexts] : ", output.stderr);
        return [];
    }

    const ctxNameList: string[] = []
    console.log(output?.stdout)

    if (output) {
        interface ContextDetails {
            cluster: string,
            user: string
        }

        interface Context {
            name: string,
            context: ContextDetails
        }

        JSON.parse(output.stdout).forEach((context: Context) => {
            ctxNameList.push(context.name);
        });
    }
    return ctxNameList;
}

// Change context on extension container
export const changeExtensionContext = async (ddClient: v1.DockerDesktopClient, context: string) => {
    // change context using kubectl
    let output = await cli(ddClient, "kubectl", ["config", "use-context", context]);
    console.log("context : ", context)
    console.log("output : ", output)
    if (output?.stderr) {
        console.log("[changeContext] : ", output.stderr);
        return false;
    }
    return true;
}

// Retrieves extensions's current k8s context
export const getCurrentExtensionContext = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl config view -o jsonpath='{.current-context}'
    let output = await cli(ddClient, "kubectl", ["config", "view", "-o", "jsonpath='{.current-context}'"]);
    if (output?.stderr) {
        console.log("[getCurrentExtensionContext] : ", output.stderr);
        return {};
    }
    return output?.stdout;
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

// Retrieves kubectl cluster-info
export const checkK8sConnection = async (ddClient: v1.DockerDesktopClient) => {
    // kubectl cluster-info
    return await cli(ddClient, "kubectl", ["cluster-info"]);
}