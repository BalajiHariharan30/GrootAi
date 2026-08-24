/**
 * @module remediationSlice
 * @description Redux slice for HITL remediation queue and audit log.
 * All fetch() calls include Authorization header from stored JWT.
 * Approvals also pass the authenticated user's name from Redux state.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authHeaders }                    from './authSlice.js';

export const fetchPendingRemediations = createAsyncThunk(
  'remediation/fetchPending',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/remediation/pending', {
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

export const fetchAuditLog = createAsyncThunk(
  'remediation/fetchAuditLog',
  async (_, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/remediation/audit-log', {
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

export const proposeRemediation = createAsyncThunk(
  'remediation/propose',
  async (issueId, { dispatch, rejectWithValue }) => {
    try {
      const res = await fetch(`/api/remediation/propose/${issueId}`, {
        method:      'POST',
        headers:     authHeaders(),
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      dispatch(fetchPendingRemediations());
      return data.data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const approveRemediation = createAsyncThunk(
  'remediation/approve',
  async ({ remediationId, approver }, { dispatch, getState, rejectWithValue }) => {
    try {
      // Use authenticated user's real name from Redux state if available
      const authUser   = getState().auth?.user;
      const actorName  = authUser
        ? `${authUser.name} <${authUser.email}>`
        : (approver ?? 'Human Data Steward');

      const res = await fetch(`/api/remediation/${remediationId}/approve`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body:        JSON.stringify({ approver: actorName }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      dispatch(fetchPendingRemediations());
      dispatch(fetchAuditLog());
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

export const rejectRemediation = createAsyncThunk(
  'remediation/reject',
  async ({ remediationId, reason }, { dispatch, rejectWithValue }) => {
    try {
      const res = await fetch(`/api/remediation/${remediationId}/reject`, {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json', ...authHeaders() },
        credentials: 'include',
        body:        JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      dispatch(fetchPendingRemediations());
      dispatch(fetchAuditLog());
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

const remediationSlice = createSlice({
  name: 'remediation',
  initialState: {
    pendingList:       [],
    auditLog:          [],
    loading:           false,
    actionInProgressId: null,
    lastApprovedAction: null,
    error:             null,
  },
  reducers: {
    clearLastApproved: (state) => {
      state.lastApprovedAction = null;
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
      });
  },
});

export const { clearLastApproved } = remediationSlice.actions;
export default remediationSlice.reducer;
