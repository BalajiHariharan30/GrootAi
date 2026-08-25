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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'grootai_jwt';

/** Returns stored JWT from localStorage */
export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

/** Persists JWT to localStorage */
export const storeToken = (token) => localStorage.setItem(TOKEN_KEY, token);

/** Removes JWT from localStorage */
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/**
 * Builds Authorization header object for fetch() calls.
 * Returns empty object if no token is available (guest mode).
 * @returns {Record<string, string>}
 */
export const authHeaders = () => {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

/**
 * Called on app boot — fetches the current user from the server using
 * the stored JWT. If the token is missing or expired, user remains unauthenticated.
 */
export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    const token = getStoredToken();
    if (!token) return rejectWithValue('no_token');

    try {
      const res = await fetch('/api/auth/me', {
        headers:     { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });

      if (res.status === 401) {
        clearToken();
        return rejectWithValue('token_expired');
      }

      const data = await res.json();
      if (!data.success) return rejectWithValue(data.error);
      return data.data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

/**
 * Authenticates an existing user with Email and Password.
 */
export const loginWithEmail = createAsyncThunk(
  'auth/loginWithEmail',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/auth/login', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!data.success) {
        return rejectWithValue(data.error || 'Login failed. Please check your credentials.');
      }

      if (data.token) storeToken(data.token);
      return data.data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

/**
 * Registers a new user with Name, Email, and Password.
 */
export const registerWithEmail = createAsyncThunk(
  'auth/registerWithEmail',
  async ({ name, email, password }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!data.success) {
        return rejectWithValue(data.error || 'Registration failed. Please try again.');
      }

      if (data.token) storeToken(data.token);
      return data.data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  },
);

/**
 * Clears local token and calls /api/auth/logout to clear the server cookie.
 */
export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { rejectWithValue }) => {
    try {
      clearToken();
      await fetch('/api/auth/logout', {
        method:      'POST',
        credentials: 'include',
      });
    } catch (err) {
      return rejectWithValue(err.message);
    }
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
