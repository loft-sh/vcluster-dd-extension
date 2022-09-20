import {getExtensionContext} from "./cli";

export interface ContextDetails {
    cluster: string,
    user: string
}

export interface Context {
    name: string,
    context: ContextDetails
}

// Converts the seconds to hh:mm:ss format
export const convertSeconds = (date: number) => {
    if (date) {
        let seconds = Math.floor((new Date().valueOf() - new Date(date).valueOf()) / 1000);
        seconds = Number(seconds);
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor(seconds % (3600 * 24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        const s = Math.floor(seconds % 60);

        const dDisplay = d > 0 ? d + "d" : "";
        const hDisplay = h > 0 ? h + "h" : "";
        const mDisplay = m > 0 && d === 0 ? m + "m" : "";
        const sDisplay = s > 0 && d === 0 && h === 0 ? s + "s" : "";
        return dDisplay + hDisplay + mDisplay + sDisplay;
    }
    return ""
}

// Converts into vCluster context format
export const getVClusterContextName = (vClusterName: string, vClusterNamespace: string, context?: string) => {
    if (context) {
        return "vcluster_" + vClusterName + "_" + vClusterNamespace + "_" + context
    }
    return "vcluster_" + vClusterName + "_" + vClusterNamespace + "_" + getExtensionContext()
}


// check if the context is of vcluster
export const isVclusterContext = (originalContext: string, contexts: Context[]) => {
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

export const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}