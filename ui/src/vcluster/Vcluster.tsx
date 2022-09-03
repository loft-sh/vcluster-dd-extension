import React, {useEffect} from "react";
import {createDockerDesktopClient} from '@docker/extension-api-client';
import "../App.css";
import ErrorIcon from '@mui/icons-material/Error';
import {
    changeExtensionContext,
    checkK8sConnection,
    connectVCluster,
    createVCluster,
    deleteVCluster,
    disconnectVCluster,
    getCurrentHostContext,
    getExtensionContext,
    listHostContexts,
    listNamespaces,
    listVClusters,
    pauseVCluster,
    resumeVCluster
} from "../helper/cli";
import {VClusterList} from "./List";
import {VClusterCreate} from "./Create";
import {Alert, Box, CircularProgress, Divider, Grid, Stack} from "@mui/material";
import Typography from '@mui/material/Typography';
import {blueGrey} from "@mui/material/colors";
import {VClusterChangeContext} from "./VClusterChangeContext";
import {IsK8sEnabled} from "../helper/constants";

const ddClient = createDockerDesktopClient();

const refreshData = async (setCurrentHostContext: React.Dispatch<React.SetStateAction<any>>, setVClusters: React.Dispatch<React.SetStateAction<any>>, setNamespaces: React.Dispatch<React.SetStateAction<any>>) => {
    try {
        if (localStorage.getItem(IsK8sEnabled) === "true") {
            const result = await Promise.all([getCurrentHostContext(ddClient), listVClusters(ddClient), listNamespaces(ddClient)]);
            setCurrentHostContext(result[0]);
            setVClusters(result[1]);
            setNamespaces(result[2]);
        }
    } catch (err: any) {
        if ("stdout" in err && err.stdout.includes("fatal") && err.stdout.includes("find vcluster")) {
            localStorage.setItem(IsK8sEnabled, "false")
        }
        console.log("error : ", JSON.stringify(err));
    }
}

const refreshContext = async (setContexts: React.Dispatch<React.SetStateAction<any>>) => {
    const result = await Promise.all([listHostContexts(ddClient), checkK8sConnection(ddClient)]);
    setContexts(result[0]);
    // check if the k8s is reachable
    console.log("isK8sEnabled[interval] : ", result[1])
}

// const checkIfK8sEnabled = async (setIsLoading: React.Dispatch<React.SetStateAction<any>>) => {
//     try {
//         setIsLoading(true);
//         // let isK8sEnabled = await listHostContexts(ddClient);
//         setIsLoading(false);
//         return false;
//         // return isK8sEnabled
//     } catch (err) {
//         console.log("checkIfK8sEnabled error : ", JSON.stringify(err));
//         setIsLoading(false);
//     }
//     return false;
// }

export const VCluster = () => {
    const [vClusters, setVClusters] = React.useState(undefined);
    const [namespaces, setNamespaces] = React.useState([]);
    const [contexts, setContexts] = React.useState([]);
    const [currentHostContext, setCurrentHostContext] = React.useState("");
    const [isLoading, setIsLoading] = React.useState(false);

    useEffect(() => {
        (async () => {
            let contexts = await listHostContexts(ddClient);
            // @ts-ignore
            setContexts(contexts)
            checkK8sConnection(ddClient);
            await refreshData(setCurrentHostContext, setVClusters, setNamespaces)
        })();

        const contextInterval = setInterval(() => refreshContext(setContexts), 5000);
        const dataInterval = setInterval(() => {
            return refreshData(setCurrentHostContext, setVClusters, setNamespaces)
        }, 5000);

        return () => {
            clearInterval(dataInterval);
            clearInterval(contextInterval);
        }
    }, []);

    const createUIVC = async (name: string, namespace: string, distro: string, chartVersion: string, values: string) => {
        try {
            if (!namespace) {
                namespace = "vcluster-" + name.toLowerCase();
            }
            const isCreated = await createVCluster(ddClient, name, namespace, distro, chartVersion, values);
            if (isCreated) {
                ddClient.desktopUI.toast.success("vcluster created successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster create failed");
            }

            await refreshData(setCurrentHostContext, setVClusters, setNamespaces);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster create failed: " + JSON.stringify(err));
        }
    };

    const changeUIContext = async (context: string) => {
        try {
            await changeExtensionContext(ddClient, context);
            ddClient.desktopUI.toast.success("extension context changed successfully");
            setIsLoading(true);
            let isK8sEnabled = await checkK8sConnection(ddClient);
            console.log("isK8sEnabled [switch context] : ", isK8sEnabled)
            if (isK8sEnabled) {
                await refreshData(setCurrentHostContext, setVClusters, setNamespaces)
            }
            setIsLoading(false)
        } catch (err) {
            ddClient.desktopUI.toast.error("extension context change failed: " + JSON.stringify(err));
        }
    };

    const upgradeUIVC = async (name: string, namespace: string, chartVersion: string, values: string) => {
        try {
            // Using the same createVCluster function for the upgrade operation. Distro upgrade is not supported
            const isUpgraded = await createVCluster(ddClient, name, namespace, "", chartVersion, values, true);
            if (isUpgraded) {
                ddClient.desktopUI.toast.success("vcluster upgraded successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster upgrade failed");
            }

            await refreshData(setCurrentHostContext, setVClusters, setNamespaces);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster upgrade failed: " + JSON.stringify(err));
        }
    };

    const deleteUIVC = async (name: string, namespace: string) => {
        try {
            const isDeleted = await deleteVCluster(ddClient, name, namespace);
            if (isDeleted) {
                ddClient.desktopUI.toast.success("vcluster deleted successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster[" + namespace + ":" + name + "] delete failed");
            }

            await refreshData(setCurrentHostContext, setVClusters, setNamespaces);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster delete failed: " + JSON.stringify(err));
        }
    };

    const pauseUIVC = async (name: string, namespace: string) => {
        try {
            const isPaused = await pauseVCluster(ddClient, name, namespace);
            if (isPaused) {
                ddClient.desktopUI.toast.success("vcluster paused successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster pause failed");
            }

            await refreshData(setCurrentHostContext, setVClusters, setNamespaces);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster pause failed: " + JSON.stringify(err));
        }
    };

    const resumeUIVC = async (name: string, namespace: string) => {
        try {
            const isResumed = await resumeVCluster(ddClient, name, namespace);
            if (isResumed) {
                ddClient.desktopUI.toast.success("vcluster resumed successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster resume failed");
            }

            await refreshData(setCurrentHostContext, setVClusters, setNamespaces);
        } catch (err) {
            ddClient.desktopUI.toast.error("vcluster resume failed : " + JSON.stringify(err));
        }
    };

    const disconnectUIVC = async (namespace: string) => {
        try {
            const isDisconnected = await disconnectVCluster(ddClient, namespace);
            if (isDisconnected) {
                ddClient.desktopUI.toast.success("vcluster disconnected successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster disconnect failed");
            }

            await refreshData(setCurrentHostContext, setVClusters, setNamespaces);
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
            const isConnected = await connectVCluster(ddClient, name, namespace);
            if (isConnected) {
                ddClient.desktopUI.toast.success("vcluster connected successfully");
            } else {
                ddClient.desktopUI.toast.error("vcluster connect failed");
            }
            await refreshData(setCurrentHostContext, setVClusters, setNamespaces);
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
        if (localStorage.getItem(IsK8sEnabled) === "true") {
            component = <React.Fragment>
                <Grid container spacing={2}>
                    <Grid item xs={6} md={6}>
                        <Stack direction="row" alignItems="left" justifyContent="left"
                               divider={<Divider orientation="vertical" flexItem/>}
                               spacing={2}>
                            <VClusterCreate
                                createUIVC={createUIVC}
                                namespaces={namespaces}/>
                        </Stack>
                    </Grid>
                    <Grid item xs={6} md={6}>
                        <Stack direction="row" alignItems="right" justifyContent="right"
                               divider={<Divider orientation="vertical" flexItem/>}
                               spacing={2}>
                            {getExtensionContext()}
                            <VClusterChangeContext
                                changeUIContext={changeUIContext}
                                contexts={contexts}/>
                        </Stack>
                    </Grid>
                    <Grid item xs={12}>
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
                    </Grid>
                </Grid>
            </React.Fragment>
        } else {
            component = <Box>
                <VClusterChangeContext
                    changeUIContext={changeUIContext}
                    contexts={contexts}/>
                <Alert iconMapping={{
                    error: <ErrorIcon fontSize="inherit"/>,
                }} severity="error" color="error">
                    Seems like Kubernetes is not reachable from your Docker Desktop. Please take a look at the <a
                    href="https://docs.docker.com/desktop/kubernetes/">docker
                    documentation</a> on how to enable the Kubernetes server in docker-desktop and then select
                    docker-desktop context.
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
