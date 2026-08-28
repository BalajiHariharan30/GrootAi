import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiGet, apiPost, apiFetch }      from './api.js';

export const fetchPendingRemediations = createAsyncThunk(
  'remediation/fetchPending',
  async (_, { rejectWithValue }) => {
    const { ok, data } = await apiGet('/api/remediation/pending');
    if (!ok) return rejectWithValue(data?.error ?? 'Failed to load queue');
    return data?.data || [];
  },
);

export const fetchAuditLog = createAsyncThunk(
  'remediation/fetchAuditLog',
  async (_, { rejectWithValue }) => {
    const { ok, data } = await apiGet('/api/remediation/audit-log');
    if (!ok) return rejectWithValue(data?.error ?? 'Failed to load audit log');
    return data?.data || [];
  },
);

export const proposeRemediation = createAsyncThunk(
  'remediation/propose',
  async (issueId, { dispatch, rejectWithValue }) => {
    const { ok, data } = await apiFetch(`/api/remediation/propose/${issueId}`, { method: 'POST' });
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Propose failed');
    dispatch(fetchPendingRemediations());
    return data.data;
  },
);

export const approveRemediation = createAsyncThunk(
  'remediation/approve',
  async ({ remediationId, approver }, { dispatch, getState, rejectWithValue }) => {
    const authUser  = getState().auth?.user;
    const actorName = authUser ? `${authUser.name} <${authUser.email}>` : (approver ?? 'Human Data Steward');
    const { ok, data } = await apiPost(`/api/remediation/${remediationId}/approve`, { approver: actorName });
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Approve failed');
    dispatch(fetchPendingRemediations());
    dispatch(fetchAuditLog());
    return data;
  },
);

export const rejectRemediation = createAsyncThunk(
  'remediation/reject',
  async ({ remediationId, reason }, { dispatch, rejectWithValue }) => {
    const { ok, data } = await apiPost(`/api/remediation/${remediationId}/reject`, { reason });
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Reject failed');
    dispatch(fetchPendingRemediations());
    dispatch(fetchAuditLog());
    return data;
  },
);

export const rollbackRemediation = createAsyncThunk(
  'remediation/rollback',
  async ({ remediationId, rolledBackBy, reason }, { dispatch, getState, rejectWithValue }) => {
    const authUser = getState().auth?.user;
    const actor    = authUser ? `${authUser.name} <${authUser.email}>` : (rolledBackBy ?? 'Human Data Steward');
    const { ok, data } = await apiPost(`/api/remediation/${remediationId}/rollback`, { rolledBackBy: actor, reason });
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Rollback failed');
    dispatch(fetchAuditLog());
    return data;
  },
);

export const fetchExplanation = createAsyncThunk(
  'remediation/explain',
  async (remediationId, { rejectWithValue }) => {
    const { ok, data } = await apiGet(`/api/remediation/${remediationId}/explain`);
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Explanation failed');
    return data.data;
  },
);

export const fetchLearningStats = createAsyncThunk(
  'remediation/learningStats',
  async (_, { rejectWithValue }) => {
    const { ok, data } = await apiGet('/api/remediation/learning/stats');
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Stats fetch failed');
    return data.data;
  },
);


const remediationSlice = createSlice({
  name: 'remediation',
  initialState: {
    pendingList:          [],
    auditLog:             [],
    loading:              false,
    actionInProgressId:   null,
    lastApprovedAction:   null,
    rollbackInProgressId: null,
    explanation:          null,
    explanationLoading:   false,
    learningStats:        null,
    learningStatsLoading: false,
    error:                null,

  },
  reducers: {
    clearLastApproved: (state) => {
      state.lastApprovedAction = null;
    },
    clearExplanation: (state) => {
      state.explanation = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPendingRemediations.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchPendingRemediations.fulfilled, (state, action) => {
        state.loading     = false;
        state.pendingList = action.payload;
      })
      .addCase(fetchPendingRemediations.rejected, (state) => {
        state.loading = false;
      })
      .addCase(fetchAuditLog.fulfilled, (state, action) => {
        state.auditLog = action.payload;
      })
      .addCase(approveRemediation.pending, (state, action) => {
        state.actionInProgressId = action.meta.arg.remediationId;
      })
      .addCase(approveRemediation.fulfilled, (state, action) => {
        state.actionInProgressId = null;
        state.lastApprovedAction = action.payload?.data ?? null;
      })
      .addCase(approveRemediation.rejected, (state) => {
        state.actionInProgressId = null;
      })
      .addCase(rejectRemediation.pending, (state, action) => {
        state.actionInProgressId = action.meta.arg.remediationId;
      })
      .addCase(rejectRemediation.fulfilled, (state) => {
        state.actionInProgressId = null;
      })
      .addCase(rejectRemediation.rejected, (state) => {
        state.actionInProgressId = null;
      })
      // Rollback
      .addCase(rollbackRemediation.pending, (state, action) => {
        state.rollbackInProgressId = action.meta.arg.remediationId;
      })
      .addCase(rollbackRemediation.fulfilled, (state) => {
        state.rollbackInProgressId = null;
      })
      .addCase(rollbackRemediation.rejected, (state) => {
        state.rollbackInProgressId = null;
      })
      // Explain
      .addCase(fetchExplanation.pending, (state) => {
        state.explanationLoading = true;
        state.explanation        = null;
      })
      .addCase(fetchExplanation.fulfilled, (state, action) => {
        state.explanationLoading = false;
        state.explanation        = action.payload;
      })
      .addCase(fetchExplanation.rejected, (state) => {
        state.explanationLoading = false;
      })
      // Learning Stats
      .addCase(fetchLearningStats.pending, (state) => {
        state.learningStatsLoading = true;
      })
      .addCase(fetchLearningStats.fulfilled, (state, action) => {
        state.learningStatsLoading = false;
        state.learningStats        = action.payload;
      })
      .addCase(fetchLearningStats.rejected, (state) => {
        state.learningStatsLoading = false;
      });

  },
});

export const { clearLastApproved, clearExplanation } = remediationSlice.actions;
export default remediationSlice.reducer;

