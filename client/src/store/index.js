import { configureStore } from '@reduxjs/toolkit';
import datasetReducer      from './datasetSlice.js';
import ruleReducer         from './ruleSlice.js';
import issueReducer        from './issueSlice.js';
import remediationReducer  from './remediationSlice.js';
import authReducer         from './authSlice.js';

export const store = configureStore({
  reducer: {
    auth:        authReducer,
    datasets:    datasetReducer,
    rules:       ruleReducer,
    issues:      issueReducer,
    remediation: remediationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});
