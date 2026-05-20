import { createSlice, configureStore, PayloadAction } from '@reduxjs/toolkit';

///////
///////

export interface GlobalSessionState {
    activeEmbedId: null | string;
}

const initialGlobalSessionState: GlobalSessionState = {
    activeEmbedId: null,
};

const globalSessionSlice = createSlice({
    name: 'global-session',
    initialState: initialGlobalSessionState,
    reducers: {
        setActiveEmbedId: (state, action: PayloadAction<string | null>) => {
            state.activeEmbedId = action.payload;
        },
    }
})

export const { setActiveEmbedId } = globalSessionSlice.actions

export const store = configureStore({
    reducer: globalSessionSlice.reducer
})