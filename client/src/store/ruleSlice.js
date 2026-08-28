import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiGet, apiPost, apiFetch }      from './api.js';

export const parseNLRule = createAsyncThunk(
  'rules/parseNL',
  async ({ naturalLanguageInput, datasetId }, { rejectWithValue }) => {
    const { ok, data } = await apiPost('/api/rules/parse', { naturalLanguageInput, datasetId });
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Parse failed');
    return data.data;
  },
);

export const fetchRulesForDataset = createAsyncThunk(
  'rules/fetchForDataset',
  async (datasetId, { rejectWithValue }) => {
    const { ok, data } = await apiGet(`/api/rules/dataset/${datasetId}`);
    if (!ok) return rejectWithValue(data?.error ?? 'Failed to load rules');
    return data?.data || [];
  },
);

export const saveAndActivateRule = createAsyncThunk(
  'rules/saveAndActivate',
  async (rulePayload, { dispatch, rejectWithValue }) => {
    // 1. Save rule
    const { ok: saveOk, data: saved } = await apiPost('/api/rules', rulePayload);
    if (!saveOk || !saved?.success) return rejectWithValue(saved?.error ?? 'Save failed');

    // 2. Activate rule (human confirmation gate)
    const { data: actData } = await apiFetch(`/api/rules/${saved.data._id}/activate`, { method: 'POST' });

    dispatch(fetchRulesForDataset(rulePayload.datasetId));
    return actData;
  },
);


const ruleSlice = createSlice({
  name: 'rules',
  initialState: {
    rulesList:     [],
    candidateRule: null,
    parsing:       false,
    activating:    false,
    parseError:    null,
    history:       [],
  },
  reducers: {
    clearCandidateRule: (state) => {
      state.candidateRule = null;
      state.parseError    = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(parseNLRule.pending, (state) => {
        state.parsing    = true;
        state.parseError = null;
      })
      .addCase(parseNLRule.fulfilled, (state, action) => {
        state.parsing       = false;
        state.candidateRule = action.payload;
        state.history.unshift(action.payload);
      })
      .addCase(parseNLRule.rejected, (state, action) => {
        state.parsing    = false;
        state.parseError = action.payload;
      })
      .addCase(fetchRulesForDataset.fulfilled, (state, action) => {
        state.rulesList = action.payload;
      })
      .addCase(saveAndActivateRule.pending, (state) => {
        state.activating = true;
      })
      .addCase(saveAndActivateRule.fulfilled, (state) => {
        state.activating    = false;
        state.candidateRule = null;
      })
      .addCase(saveAndActivateRule.rejected, (state) => {
        state.activating = false;
      });
  },
});

export const { clearCandidateRule } = ruleSlice.actions;
export default ruleSlice.reducer;
