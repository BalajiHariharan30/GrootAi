/**
 * @module issueSlice
 * @description Redux slice for Issue triage, pagination, explanation, and dismissal.
 * All fetch() calls include Authorization header from stored JWT.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authHeaders }                    from './authSlice.js';

export const fetchIssues = createAsyncThunk(
  'issues/fetch',
  async ({ datasetId, cursor, severity, type, status }, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (cursor)                    params.append('cursor',   cursor);
      if (severity && severity !== 'all') params.append('severity', severity);
      if (type     && type     !== 'all') params.append('type',     type);
      if (status)                    params.append('status',   status);

      const res = await fetch(`/api/issues/dataset/${datasetId}?${params.toString()}`, {
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchMatchExplanation = createAsyncThunk(
  'issues/fetchExplanation',
  async (issueId, { rejectWithValue }) => {
    try {
      const res = await fetch(`/api/issues/${issueId}/explain`, {
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      return data.data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const dismissIssue = createAsyncThunk(
  'issues/dismiss',
  async ({ issueId, datasetId }, { dispatch, rejectWithValue }) => {
    try {
      const res = await fetch(`/api/issues/${issueId}/dismiss`, {
        method:      'POST',
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      dispatch(fetchIssues({ datasetId }));
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

const issueSlice = createSlice({
  name: 'issues',
  initialState: {
    items:              [],
    nextCursor:         null,
    hasMore:            false,
    loading:            false,
    filters: {
      severity: 'all',
      type:     'all',
      status:   'open',
    },
    activeExplanation:  null,
    explanationLoading: false,
    error:              null,
  },
  reducers: {
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
      // Reset cursor when filters change so we start from the beginning
      state.items      = [];
      state.nextCursor = null;
      state.hasMore    = false;
    },
    clearActiveExplanation: (state) => {
      state.activeExplanation = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIssues.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(fetchIssues.fulfilled, (state, action) => {
        state.loading    = false;
        state.items      = action.payload.data    || [];
        state.nextCursor = action.payload.nextCursor;
        state.hasMore    = action.payload.hasMore;
      })
      .addCase(fetchIssues.rejected, (state, action) => {
        state.loading = false;
        state.error   = action.payload;
      })
      .addCase(fetchMatchExplanation.pending, (state) => {
        state.explanationLoading = true;
      })
      .addCase(fetchMatchExplanation.fulfilled, (state, action) => {
        state.explanationLoading = false;
        state.activeExplanation  = action.payload;
      })
      .addCase(fetchMatchExplanation.rejected, (state) => {
        state.explanationLoading = false;
      });
  },
});

export const { setFilters, clearActiveExplanation } = issueSlice.actions;
export default issueSlice.reducer;
