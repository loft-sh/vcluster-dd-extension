import React, {useEffect} from "react";
import {createDockerDesktopClient} from '@docker/extension-api-client';
import "../App.css";
import ErrorIcon from '@mui/icons-material/Error';
import {
    changeExtensionContext,
    connectVCluster,
    createVCluster,
    deleteVCluster,
    disconnectVCluster,
    getCurrentExtensionContext,
    getCurrentHostContext,
    listExtensionContexts,
    listHostContexts,
    listNamespaces,
    listVClusters,
    pauseVCluster,
    resumeVCluster
} from "../helper/cli";
import {VClusterList} from "./List";
import {VClusterCreate} from "./Create";
import {Alert, Box, CircularProgress, Stack} from "@mui/material";
import Typography from '@mui/material/Typography';
import {blueGrey} from "@mui/material/colors";
import {VClusterChangeContext} from "./VClusterChangeContext";

const ddClient = createDockerDesktopClient();

const refreshData = async (setCurrentHostContext: React.Dispatch<React.SetStateAction<any>>, setCurrentExtensionContext: React.Dispatch<React.SetStateAction<any>>, setVClusters: React.Dispatch<React.SetStateAction<any>>, setNamespaces: React.Dispatch<React.SetStateAction<any>>, setContexts: React.Dispatch<React.SetStateAction<any>>) => {
    try {
        const result = await Promise.all([getCurrentHostContext(ddClient), getCurrentExtensionContext(ddClient), listVClusters(ddClient), listNamespaces(ddClient), listExtensionContexts(ddClient)]);
        setCurrentHostContext(result[0]);
        setCurrentExtensionContext(result[1]);
        setVClusters(result[2]);
        setNamespaces(result[3]);
        setContexts(result[4]);
    } catch (err) {
        console.log("error", JSON.stringify(err));
        setCurrentHostContext("");
    }
}

const refreshContext = async (isDDK8sEnabled: boolean, setIsDDK8sEnabled: React.Dispatch<React.SetStateAction<any>>) => {
    if (!isDDK8sEnabled) {
        try {
            let isDDK8sEnabled = await listHostContexts(ddClient);
            console.log("isDDK8sEnabled[interval] : ", isDDK8sEnabled)
            setIsDDK8sEnabled(isDDK8sEnabled)
        } catch (err) {
            console.log("isDDK8sEnabled[interval] error : ", JSON.stringify(err));
            setIsDDK8sEnabled(false);
        }
    } else {
        console.log("isDDK8sEnabled[interval] : ", isDDK8sEnabled)
    }
}

const checkIfDDK8sEnabled = async (setIsLoading: React.Dispatch<React.SetStateAction<any>>) => {
    try {
        setIsLoading(true);
        let isDDK8sEnabled = await listHostContexts(ddClient);
        setIsLoading(false);
        return isDDK8sEnabled
    } catch (err) {
        console.log("checkIfDDK8sEnabled error : ", JSON.stringify(err));
        setIsLoading(false);
    }
    return false;
}

export const VCluster = () => {
    const [vClusters, setVClusters] = React.useState(undefined);
    const [namespaces, setNamespaces] = React.useState([]);
    const [contexts, setContexts] = React.useState([]);
    const [currentHostContext, setCurrentHostContext] = React.useState("");
    const [currentExtensionContext, setCurrentExtensionContext] = React.useState("");
    const [isDDK8sEnabled, setIsDDK8sEnabled] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);

    useEffect(() => {
        (async () => {
            let isDDK8sEnabled = await checkIfDDK8sEnabled(setIsLoading);
            console.log("isDDK8sEnabled : ", isDDK8sEnabled)
            await setIsDDK8sEnabled(isDDK8sEnabled)
            if (isDDK8sEnabled) {
                await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts)
            }
        })();
        const contextInterval = setInterval(() => refreshContext(isDDK8sEnabled, setIsDDK8sEnabled), 5000);
        const dataInterval = setInterval(() => {
            if (isDDK8sEnabled) {
                return refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts)
            }
        }, 5000);
        return () => {
            clearInterval(dataInterval);
            clearInterval(contextInterval);
        }
    }, [isDDK8sEnabled]);

    const createUIVC = async (name: string, namespace: string, distro: string, chartVersion: string, values: string) => {
        try {
            if (!namespace) {
                namespace = "vcluster-" + name.toLowerCase();
            }
            const isCreated = await createVCluster(ddClient, name, namespace, distro, chartVersion, values, currentExtensionContext);
            if (isCreated) {
                ddClient.desktopUI.toast.success("vcluster created successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster create failed");
            }

            await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster create failed: " + JSON.stringify(err));
        }
    };

    const changeUIContext = async (context: string) => {
        try {
            const isChanged = await changeExtensionContext(ddClient, context);
            if (isChanged) {
                ddClient.desktopUI.toast.success("extension context changed successfully");
            } else {
                ddClient.desktopUI.toast.error("extension context change failed");
            }
            await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts);
        } catch (err) {
            ddClient.desktopUI.toast.error("extension context change failed: " + JSON.stringify(err));
        }
    };

    const upgradeUIVC = async (name: string, namespace: string, chartVersion: string, values: string) => {
        try {
            // Using the same createVCluster function for the upgrade operation. Distro upgrade is not supported
            const isUpgraded = await createVCluster(ddClient, name, namespace, "", chartVersion, values, currentExtensionContext, true);
            if (isUpgraded) {
                ddClient.desktopUI.toast.success("vcluster upgraded successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster upgrade failed");
            }

            await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster upgrade failed: " + JSON.stringify(err));
        }
    };

    const deleteUIVC = async (name: string, namespace: string) => {
        try {
            const isDeleted = await deleteVCluster(ddClient, name, namespace, currentHostContext);
            if (isDeleted) {
                ddClient.desktopUI.toast.success("vcluster deleted successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster[" + namespace + ":" + name + "] delete failed");
            }

            await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster delete failed: " + JSON.stringify(err));
        }
    };

    const pauseUIVC = async (name: string, namespace: string) => {
        try {
            const isPaused = await pauseVCluster(ddClient, name, namespace, currentExtensionContext);
            if (isPaused) {
                ddClient.desktopUI.toast.success("vcluster paused successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster pause failed");
            }

            await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster pause failed: " + JSON.stringify(err));
        }
    };

    const resumeUIVC = async (name: string, namespace: string) => {
        try {
            const isResumed = await resumeVCluster(ddClient, name, namespace, currentExtensionContext);
            if (isResumed) {
                ddClient.desktopUI.toast.success("vcluster resumed successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster resume failed");
            }

            await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster resume failed : " + JSON.stringify(err));
        }
    };

    const disconnectUIVC = async (namespace: string, context: string) => {
        try {
            const isDisconnected = await disconnectVCluster(ddClient, namespace, context);
            if (isDisconnected) {
                ddClient.desktopUI.toast.success("vcluster disconnected successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster disconnect failed");
            }

            await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster disconnect failed: " + JSON.stringify(err));
        }
    };

    const connectUIVC = async (name: string, namespace: string) => {
        // const nodePortService = await isNodePortServiceAvailableForVcluster(ddClient, name, namespace)
        // if (!nodePortService) {
        //     ddClient.desktopUI.toast.warning("Please use `vcluster connect` from terminal, as " + name + " doesn't have nodeport service enabled");
        // } else {
        try {
            const isConnected = await connectVCluster(ddClient, name, namespace, currentExtensionContext);
            if (isConnected) {
                ddClient.desktopUI.toast.success("vcluster connected successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster connect failed");
            }
            await refreshData(setCurrentHostContext, setCurrentExtensionContext, setVClusters, setNamespaces, setContexts);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster connect failed: " + JSON.stringify(err));
        }
    }

    let component
    if (isLoading) {
        component = <Box sx={{
            marginBottom: "15px",
            textAlign: "center"
        }}>
            <CircularProgress
                size={50}
                sx={{
                    color: blueGrey[500],
                }}
            />
        </Box>
    } else {
        if (isDDK8sEnabled) {
            component = <React.Fragment>
                <VClusterCreate
                    createUIVC={createUIVC}
                    namespaces={namespaces}/>
                <VClusterChangeContext
                    changeUIContext={changeUIContext}
                    contexts={contexts}/>
                <VClusterList
                    upgradeUIVC={upgradeUIVC}
                    deleteUIVC={deleteUIVC}
                    pauseUIVC={pauseUIVC}
                    resumeUIVC={resumeUIVC}
                    disconnectUIVC={disconnectUIVC}
                    connectUIVC={connectUIVC}
                    vClusters={vClusters}
                    currentHostContext={currentHostContext}
                />
            </React.Fragment>
        } else {
            component = <Box>
                <Alert iconMapping={{
                    error: <ErrorIcon fontSize="inherit"/>,
                }} severity="error" color="error">
                    Seems like Kubernetes is not enabled in your Docker Desktop. Please take a look at the <a
                    href="https://docs.docker.com/desktop/kubernetes/">docker
                    documentation</a> on how to enable the Kubernetes server.
                </Alert>
            </Box>
        }
    }
    return <Stack direction="column" spacing={2}>
        <Box sx={{
            marginBottom: "15px",
            textAlign: "left"
        }}>
            <Typography variant="h3">
                Create fully functional virtual Kubernetes clusters - Each vcluster runs inside a namespace of the
                underlying k8s cluster. It's cheaper than creating separate full-blown clusters and it offers better
                multi-tenancy and isolation than regular namespaces.
            </Typography>
        </Box>
        {component}
    </Stack>;
}
