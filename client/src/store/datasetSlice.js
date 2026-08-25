/**
 * @module datasetSlice
 * @description Redux slice for dataset catalog, profiling, scanning, and eval suite.
 * All fetch() calls include Authorization header from stored JWT.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authHeaders }                    from './authSlice.js';

export const fetchDatasets = createAsyncThunk(
  'datasets/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/datasets', {
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      return data.data || [];
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchDatasetProfile = createAsyncThunk(
  'datasets/fetchProfile',
  async (datasetId, { rejectWithValue }) => {
    try {
      const res = await fetch(`/api/datasets/${datasetId}/profile`, {
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

export const seedDatasets = createAsyncThunk(
  'datasets/seed',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const res = await fetch('/api/datasets/seed', {
        method:      'POST',
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      dispatch(fetchDatasets());
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const triggerScan = createAsyncThunk(
  'datasets/scan',
  async (datasetId, { dispatch, rejectWithValue }) => {
    try {
      const res = await fetch(`/api/datasets/${datasetId}/scan`, {
        method:      'POST',
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      dispatch(fetchDatasetProfile(datasetId));
      dispatch(fetchDatasets());
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const fetchLatestEval = createAsyncThunk(
  'datasets/fetchLatestEval',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/eval/latest', {
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      const raw  = data.data ?? {};

      // Normalise server field names → what EvalSuitePage expects
      return {
        accuracy:         typeof raw.accuracyPercent === 'number' ? raw.accuracyPercent / 100 : raw.accuracy,
        operatorAccuracy: typeof raw.operatorAccuracyPercent === 'number' ? raw.operatorAccuracyPercent / 100 : raw.operatorAccuracy,
        f1Score:          raw.detectionQuality?.f1Score     ?? raw.f1Score,
        latencyP50:       raw.latency?.p50Ms                ?? raw.latencyP50,
        latencyP95:       raw.latency?.p95Ms                ?? raw.latencyP95,
        caseResults:      raw.detailedResults               ?? raw.caseResults ?? [],
        passedCases:      (raw.detailedResults ?? raw.caseResults ?? []).filter((c) => c.passed).length,
        totalCases:       raw.benchmarkCasesCount           ?? (raw.detailedResults?.length ?? 0),
        detectionQuality: raw.detectionQuality,
        cacheEfficiency:  raw.cacheEfficiency,
        timestamp:        raw.timestamp,
      };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const runEvalSuite = createAsyncThunk(
  'datasets/runEvalSuite',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/eval/run', {
        method:      'POST',
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      const raw  = data.data ?? {};

      return {
        accuracy:         typeof raw.accuracyPercent === 'number' ? raw.accuracyPercent / 100 : raw.accuracy,
        operatorAccuracy: typeof raw.operatorAccuracyPercent === 'number' ? raw.operatorAccuracyPercent / 100 : raw.operatorAccuracy,
        f1Score:          raw.detectionQuality?.f1Score     ?? raw.f1Score,
        latencyP50:       raw.latency?.p50Ms                ?? raw.latencyP50,
        latencyP95:       raw.latency?.p95Ms                ?? raw.latencyP95,
        caseResults:      raw.detailedResults               ?? raw.caseResults ?? [],
        passedCases:      (raw.detailedResults ?? raw.caseResults ?? []).filter((c) => c.passed).length,
        totalCases:       raw.benchmarkCasesCount           ?? (raw.detailedResults?.length ?? 0),
        detectionQuality: raw.detectionQuality,
        cacheEfficiency:  raw.cacheEfficiency,
        timestamp:        raw.timestamp,
      };
    } catch (err) {

      return rejectWithValue(err.message);
    }
  },
);

export const fetchSystemStats = createAsyncThunk(
  'datasets/fetchSystemStats',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/eval/system-stats', {
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      return data.data ?? {};
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

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
