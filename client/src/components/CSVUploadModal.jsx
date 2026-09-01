import React, { useState } from 'react';
import { X, UploadCloud, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { fetchDatasets, fetchDatasetProfile } from '../store/datasetSlice.js';
import { apiFetch } from '../store/api.js';

export const CSVUploadModal = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const [file, setFile] = useState(null);
  const [datasetName, setDatasetName] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      if (!datasetName) {
        setDatasetName(selected.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', datasetName);
    formData.append('description', description);

    try {
      const { ok, data } = await apiFetch('/api/datasets/upload', {
        method: 'POST',
        body: formData
      });
      if (!ok || !data?.success) throw new Error(data?.error || 'Upload failed');

      dispatch(fetchDatasets());
      if (data.data?._id) {
        dispatch(fetchDatasetProfile(data.data._id));
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md">
      <div className="glass-panel w-full max-w-lg rounded-2xl border border-slate-700/80 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/80 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center text-brand-cyan">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Ingest & Auto-Profile Dataset</h3>
            <p className="text-xs text-slate-400">Upload CSV to trigger instant automated schema profiling</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Dataset Name</label>
            <input
              type="text"
              required
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="e.g. Healthcare Clinical Trials"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-cyan"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Description (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context or department notes..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-cyan"
            />
          </div>

          {/* Drag and drop area */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">CSV File</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-xl p-6 cursor-pointer hover:border-brand-cyan/60 hover:bg-slate-900/50 transition-colors">
              <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
              {file ? (
                <div className="flex items-center space-x-2 text-brand-cyan text-xs font-bold">
                  <FileText className="w-5 h-5" />
                  <span>{file.name}</span>
                </div>
              ) : (
                <div className="text-center text-xs text-slate-400">
                  <UploadCloud className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="font-semibold text-slate-300">Click to select or drag CSV here</p>
                  <p className="text-[10px] text-slate-400 mt-1">Up to 50MB tabular dataset</p>
                </div>
              )}
            </label>
          </div>

          <div className="pt-3 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || uploading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-cyan to-brand-500 text-slate-950 shadow-glow-cyan transition-all active:scale-95 disabled:opacity-50"
            >
              {uploading ? 'Profiling & Ingesting...' : 'Start Auto-Profiling'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

