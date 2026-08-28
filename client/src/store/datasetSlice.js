import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiGet, apiFetch }               from './api.js';

const normaliseEval = (raw = {}) => ({
  accuracy:         typeof raw.accuracyPercent === 'number' ? raw.accuracyPercent / 100 : raw.accuracy,
  operatorAccuracy: typeof raw.operatorAccuracyPercent === 'number' ? raw.operatorAccuracyPercent / 100 : raw.operatorAccuracy,
  f1Score:          raw.detectionQuality?.f1Score  ?? raw.f1Score,
  latencyP50:       raw.latency?.p50Ms             ?? raw.latencyP50,
  latencyP95:       raw.latency?.p95Ms             ?? raw.latencyP95,
  caseResults:      raw.detailedResults            ?? raw.caseResults ?? [],
  passedCases:      (raw.detailedResults ?? raw.caseResults ?? []).filter((c) => c.passed).length,
  totalCases:       raw.benchmarkCasesCount        ?? (raw.detailedResults?.length ?? 0),
  detectionQuality: raw.detectionQuality,
  cacheEfficiency:  raw.cacheEfficiency,
  timestamp:        raw.timestamp,
});

export const fetchDatasets = createAsyncThunk('datasets/fetchAll', async (_, { rejectWithValue }) => {
  const { ok, data } = await apiGet('/api/datasets');
  if (!ok) return rejectWithValue(data?.error ?? 'Failed to load datasets');
  return data?.data || [];
});

export const fetchDatasetProfile = createAsyncThunk('datasets/fetchProfile', async (datasetId, { rejectWithValue }) => {
  const { ok, data } = await apiGet(`/api/datasets/${datasetId}/profile`);
  if (!ok) return rejectWithValue(data?.error ?? 'Profile fetch failed');
  return data?.data;
});

export const seedDatasets = createAsyncThunk('datasets/seed', async (_, { dispatch, rejectWithValue }) => {
  const { ok, data } = await apiFetch('/api/datasets/seed', { method: 'POST' });
  if (!ok) return rejectWithValue(data?.error ?? 'Seed failed');
  dispatch(fetchDatasets());
  return data;
});

export const triggerScan = createAsyncThunk('datasets/scan', async (datasetId, { dispatch, rejectWithValue }) => {
  const { ok, data } = await apiFetch(`/api/datasets/${datasetId}/scan`, { method: 'POST' });
  if (!ok) return rejectWithValue(data?.error ?? 'Scan failed');
  dispatch(fetchDatasetProfile(datasetId));
  dispatch(fetchDatasets());
  return data;
});

export const fetchLatestEval = createAsyncThunk('datasets/fetchLatestEval', async (_, { rejectWithValue }) => {
  const { ok, data } = await apiGet('/api/eval/latest');
  if (!ok) return rejectWithValue(data?.error ?? 'Eval fetch failed');
  return normaliseEval(data?.data ?? {});
});

export const runEvalSuite = createAsyncThunk('datasets/runEvalSuite', async (_, { rejectWithValue }) => {
  const { ok, data } = await apiFetch('/api/eval/run', { method: 'POST' });
  if (!ok) return rejectWithValue(data?.error ?? 'Eval run failed');
  return normaliseEval(data?.data ?? {});
});

export const fetchSystemStats = createAsyncThunk('datasets/fetchSystemStats', async (_, { rejectWithValue }) => {
  const { ok, data } = await apiGet('/api/eval/system-stats');
  if (!ok) return rejectWithValue(data?.error ?? 'Stats fetch failed');
  return data?.data ?? {};
});


const datasetSlice = createSlice({
  name: 'datasets',
  initialState: {
    list:                [],
    selectedDatasetId:   null,
    activeProfile:       null,
    loading:             false,
    scanning:            false,
    scanProgressMessage: '',
    error:               null,
    schemaDrift:         null,
    // Eval suite
    evalResults:  null,
    systemStats:  {},
    evalRunning:  false,
  },
  reducers: {
    setSelectedDataset: (state, action) => {
      state.selectedDatasetId = action.payload;
    },
    setScanProgress: (state, action) => {
      state.scanProgressMessage = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatasets.fulfilled, (state, action) => {
        state.list = action.payload;
        if (!state.selectedDatasetId && action.payload.length > 0) {
          state.selectedDatasetId = action.payload[0]._id;
        }
      })
      .addCase(fetchDatasetProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDatasetProfile.fulfilled, (state, action) => {
        state.loading       = false;
        state.activeProfile = action.payload;
      })
      .addCase(fetchDatasetProfile.rejected, (state, action) => {
        state.loading = false;
        state.error   = action.payload;
      })
      .addCase(triggerScan.pending, (state) => {
        state.scanning = true;
      })
      .addCase(triggerScan.fulfilled, (state, action) => {
        state.scanning    = false;
        state.schemaDrift = action.payload?.drift || null;
      })
      .addCase(triggerScan.rejected, (state) => {
        state.scanning = false;
      })
      // Eval suite
      .addCase(fetchLatestEval.fulfilled, (state, action) => {
        state.evalResults = action.payload;
      })
      .addCase(fetchSystemStats.fulfilled, (state, action) => {
        state.systemStats = action.payload;
      })
      .addCase(runEvalSuite.pending, (state) => {
        state.evalRunning = true;
      })
      .addCase(runEvalSuite.fulfilled, (state, action) => {
        state.evalRunning = false;
        state.evalResults = action.payload;
      })
      .addCase(runEvalSuite.rejected, (state) => {
        state.evalRunning = false;
      });
  },
});

export const { setSelectedDataset, setScanProgress } = datasetSlice.actions;
export default datasetSlice.reducer;
