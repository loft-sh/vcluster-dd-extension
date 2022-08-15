import React, {ChangeEvent} from "react";
import CreateIcon from '@mui/icons-material/Create';
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField} from "@mui/material";
import {AsyncButton} from "./AsyncButton/AsyncButton";

type Props = {
    contexts: string[],
    changeUIContext: (context: string) => void
};

export const VClusterChangeContext = (props: Props) => {
    const [open, setOpen] = React.useState(false);
    const [context, setContext] = React.useState("");

    const handleClickOpen = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setContext("");
        setOpen(false);
    };

    const handleContextChange = (event: ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>) => {
        setContext(event.target.value);
    };

    const changeUIContext = async (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        await props.changeUIContext(context);
        handleClose();
    };

    return <Stack direction="row" spacing={2}>
        <Dialog
            open={open}
            onClose={handleClose}
            aria-labelledby="form-dialog-title">
            <DialogTitle id="form-dialog-title" align={"left"}>
                Switch extension context
            </DialogTitle>
            <form noValidate>
                <DialogContent>
                    <Stack direction="column" spacing={2}>
                        <TextField
                            id="outlined-select-context"
                            select
                            label="Context"
                            size="medium"
                            value={context}
                            onChange={handleContextChange}
                            variant="outlined">
                            {props.contexts.map((context: string) => (
                                <MenuItem key={context} value={context}>
                                    {context}
                                </MenuItem>
                            ))}
                        </TextField>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose} color="secondary" variant="outlined">
                        Cancel
                    </Button>
                    <AsyncButton
                        buttonType="normal"
                        color="primary"
                        variant="contained"
                        onClickAsync={async (e) =>
                            await changeUIContext(e)
                        }
                        disabled={context === ""}
                        type="submit">
                        Switch
                    </AsyncButton>
                </DialogActions>
            </form>
        </Dialog>
        <Button variant="contained" onClick={handleClickOpen} startIcon={<CreateIcon/>}>
            Switch extension context
        </Button>
    </Stack>
}