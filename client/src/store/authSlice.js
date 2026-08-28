/**
 * @module authSlice
 * @description Redux slice managing authentication state supporting both
 * Email/Password credentials and Google OAuth 2.0.
 *
 * State shape:
 *  user            → { id, email, name, avatar, role } | null
 *  isAuthenticated → true if signed in
 *  isGuestMode     → true if browsing as unauthenticated guest
 *  loading         → true while async operations or /api/auth/me is in-flight
 *  error           → error message string | null
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiGet, apiPost, apiFetch, storeToken, clearToken, getStoredToken } from './api.js';

export { getStoredToken, storeToken, clearToken };
export const authHeaders = () => {
  const t = getStoredToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    const token = getStoredToken();
    if (!token) return rejectWithValue('no_token');
    const { ok, status, data } = await apiGet('/api/auth/me');
    if (status === 401) { clearToken(); return rejectWithValue('token_expired'); }
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Auth failed');
    return data.data;
  },
);

export const loginWithEmail = createAsyncThunk(
  'auth/loginWithEmail',
  async ({ email, password }, { rejectWithValue }) => {
    const { ok, data } = await apiPost('/api/auth/login', { email, password });
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Login failed. Please check your credentials.');
    if (data.token) storeToken(data.token);
    return data.data;
  },
);

export const registerWithEmail = createAsyncThunk(
  'auth/registerWithEmail',
  async ({ name, email, password }, { rejectWithValue }) => {
    const { ok, data } = await apiPost('/api/auth/register', { name, email, password });
    if (!ok || !data?.success) return rejectWithValue(data?.error ?? 'Registration failed. Please try again.');
    if (data.token) storeToken(data.token);
    return data.data;
  },
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async () => {
    clearToken();
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    /** @type {{ id: string; email: string; name: string; avatar: string | null; role: string } | null} */
    user:            null,
    isAuthenticated: false,
    isGuestMode:     false,
    loading:         true,   // true on boot while /me is resolving
    authSubmitting:  false,  // true while login/register is processing
    error:           null,
  },

  reducers: {
    /**
     * Called after Google OAuth callback redirects to the frontend.
     */
    setTokenFromUrl: (state, action) => {
      const { token, user } = action.payload;
      storeToken(token);
      state.user            = user;
      state.isAuthenticated = true;
      state.isGuestMode     = false;
      state.loading         = false;
      state.error           = null;
    },

    /** Enables guest / demo mode — no token, read-only access */
    enterGuestMode: (state) => {
      clearToken();
      state.user            = null;
      state.isAuthenticated = false;
      state.isGuestMode     = true;
      state.loading         = false;
      state.error           = null;
    },

    /** Clears error state */
    clearAuthError: (state) => {
      state.error = null;
    },

    /** Resets auth state (used after logout) */
    clearAuth: (state) => {
      clearToken();
      state.user            = null;
      state.isAuthenticated = false;
      state.isGuestMode     = false;
      state.loading         = false;
      state.error           = null;
    },
  },

  extraReducers: (builder) => {
    builder
      // fetchCurrentUser
      .addCase(fetchCurrentUser.pending, (state) => {
        state.loading = true;
        state.error   = null;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user            = action.payload;
        state.isAuthenticated = true;
        state.isGuestMode     = false;
        state.loading         = false;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.user            = null;
        state.isAuthenticated = false;
        state.loading         = false;
        state.error           = action.payload === 'no_token' ? null : action.payload;
      })

      // loginWithEmail
      .addCase(loginWithEmail.pending, (state) => {
        state.authSubmitting = true;
        state.error          = null;
      })
      .addCase(loginWithEmail.fulfilled, (state, action) => {
        state.user            = action.payload;
        state.isAuthenticated = true;
        state.isGuestMode     = false;
        state.authSubmitting  = false;
        state.error           = null;
      })
      .addCase(loginWithEmail.rejected, (state, action) => {
        state.authSubmitting  = false;
        state.error           = action.payload;
      })

      // registerWithEmail
      .addCase(registerWithEmail.pending, (state) => {
        state.authSubmitting = true;
        state.error          = null;
      })
      .addCase(registerWithEmail.fulfilled, (state, action) => {
        state.user            = action.payload;
        state.isAuthenticated = true;
        state.isGuestMode     = false;
        state.authSubmitting  = false;
        state.error           = null;
      })
      .addCase(registerWithEmail.rejected, (state, action) => {
        state.authSubmitting  = false;
        state.error           = action.payload;
      })

      // logoutUser
      .addCase(logoutUser.fulfilled, (state) => {
        state.user            = null;
        state.isAuthenticated = false;
        state.isGuestMode     = false;
        state.loading         = false;
        state.error           = null;
      });
  },
});

export const { setTokenFromUrl, enterGuestMode, clearAuth, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
