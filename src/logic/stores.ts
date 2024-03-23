import { createSlice, configureStore } from '@reduxjs/toolkit';

///////
///////

export interface GlobalSessionState {
    activeEmbedId: null | string;
}

const globalSessionSlice = createSlice({
    name: 'global-session',
    initialState: {
        activeEmbedId: null
    },
    reducers: {
        setActiveEmbedId: (state, data) => {
            console.log('state.activeEmbedId', state.activeEmbedId);
            state.activeEmbedId = data.payload;
        },
    }
})

export const { setActiveEmbedId } = globalSessionSlice.actions

export const store = configureStore({
    reducer: globalSessionSlice.reducer
})