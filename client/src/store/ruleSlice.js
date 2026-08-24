/**
 * @module ruleSlice
 * @description Redux slice for NL Rule lifecycle management.
 * All fetch() calls include Authorization header from stored JWT.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authHeaders }                    from './authSlice.js';

export const parseNLRule = createAsyncThunk(
  'rules/parseNL',
  async ({ naturalLanguageInput, datasetId }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/rules/parse', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body:    JSON.stringify({ naturalLanguageInput, datasetId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchRulesForDataset = createAsyncThunk(
  'rules/fetchForDataset',
  async (datasetId, { rejectWithValue }) => {
    try {
      const res = await fetch(`/api/rules/dataset/${datasetId}`, {
        headers: authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      return data.data || [];
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const saveAndActivateRule = createAsyncThunk(
  'rules/saveAndActivate',
  async (rulePayload, { dispatch, rejectWithValue }) => {
    try {
      // 1. Save rule
      const saveRes = await fetch('/api/rules', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body:    JSON.stringify(rulePayload),
      });
      const saved = await saveRes.json();
      if (!saved.success) throw new Error(saved.error);

      // 2. Activate rule (human confirmation gate)
      const actRes = await fetch(`/api/rules/${saved.data._id}/activate`, {
        method:  'POST',
        headers: authHeaders(),
        credentials: 'include',
      });
      const actData = await actRes.json();

      dispatch(fetchRulesForDataset(rulePayload.datasetId));
      return actData;
    } catch (err) {
      return rejectWithValue(err.message);
    }
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
