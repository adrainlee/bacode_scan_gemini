'use client'; // Required for hooks and event handlers

import React, { useState, useEffect, useCallback, useRef } from 'react';
import useSWR from 'swr';
import * as XLSX from 'xlsx';

// Define the structure of a scan record
interface Scan {
  id: number;
  barcode: string;
  scanned_at: string; // Use string for display, backend sends ISO string
}

// --- Debounce Hook ---
function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cancel the timeout if value changes (or component unmounts)
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// --- API Fetcher ---
// Assuming backend runs on port 8000 locally
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const fetcher = (url: string) => fetch(url).then((res) => {
    if (!res.ok) {
        throw new Error('Network response was not ok');
    }
    return res.json();
});


export default function Home() {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null); // Added 'info' type
  const [queryParams, setQueryParams] = useState({ startDate: '', endDate: '', barcodeQuery: '' });
  const [searchTrigger, setSearchTrigger] = useState(0); // State to trigger SWR refetch

  const debouncedBarcode = useDebounce(barcodeInput, 1000); // 1 second debounce
  const inputRef = useRef<HTMLInputElement>(null); // Ref for the input field
  const isSubmittingRef = useRef(isSubmitting); // Ref to track latest isSubmitting state
  const submittedValueRef = useRef<string | null>(null); // Ref to track the value being submitted
  const scansRef = useRef<Scan[] | undefined>(undefined); // Ref to hold latest scans data (initialize with undefined)

  // Keep isSubmittingRef updated without causing re-renders that trigger effects
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  // --- Data Fetching with SWR ---
  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (queryParams.startDate) params.append('start_date', new Date(queryParams.startDate).toISOString());
    if (queryParams.endDate) params.append('end_date', new Date(queryParams.endDate).toISOString());
    if (queryParams.barcodeQuery) params.append('barcode', queryParams.barcodeQuery);
    // Add limit for pagination later if needed
    params.append('limit', '100'); // Fetch latest 100 for now
    return params.toString();
  };

  const { data: scans, error: fetchError, isLoading: isLoadingScans, mutate } = useSWR<Scan[]>(
    `${API_BASE_URL}/scans/?${buildQueryString()}&trigger=${searchTrigger}`,
    fetcher,
    { revalidateOnFocus: false } // Disable revalidation on window focus
  );

  // Keep scansRef updated
  useEffect(() => {
    scansRef.current = scans;
  }, [scans]);

  // --- Barcode Submission Logic ---
  const submitScan = useCallback(async (barcode: string) => {
    // Use ref for the check to prevent race conditions
    if (!barcode || isSubmittingRef.current) return;

    setIsSubmitting(true);
    submittedValueRef.current = barcode; // Mark this value as being processed
    setIsSubmitting(true); // Update state to reflect in UI (e.g., disable input)
    setSubmitStatus(null);
    console.log(`Submitting barcode: ${barcode}`);

    try {
      const response = await fetch(`${API_BASE_URL}/scans/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ barcode: barcode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to submit scan');
      }

      const newScan: Scan = await response.json();
      console.log('Scan submitted successfully:', newScan);
      setSubmitStatus({ message: `条码 "${barcode}" 提交成功!`, type: 'success' });
      setBarcodeInput(''); // Clear input only on success
      mutate(); // Revalidate SWR data
      // Refocus after state updates settle
      setTimeout(() => inputRef.current?.focus(), 0);

    } catch (err: unknown) {
      console.error('Submission error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSubmitStatus({ message: `提交失败: ${errorMessage}`, type: 'error' });
      // Consider if input should be cleared on error or kept for correction
    } finally {
      // Reset submitted value ref *only if* it still holds the value we just processed
      if (submittedValueRef.current === barcode) {
        submittedValueRef.current = null;
      }
      setIsSubmitting(false); // Update state
      setTimeout(() => setSubmitStatus(null), 3000);
    }
  }, [mutate]); // useCallback depends only on mutate (stable)

  // Effect to trigger submission when debounced value changes
  // Effect to trigger submission based *only* on debouncedBarcode changes
  useEffect(() => {
    // Only proceed if we have a debounced barcode value
    if (!debouncedBarcode) {
      return;
    }

    // Check for duplicates using the latest scans data from the ref
    if (scansRef.current) {
      const isDuplicate = scansRef.current.some(scan => scan.barcode === debouncedBarcode);
      if (isDuplicate) {
        console.log(`Duplicate barcode detected: ${debouncedBarcode}. Skipping submission.`);
        setSubmitStatus({ message: `条码 "${debouncedBarcode}" 已存在，已跳过。`, type: 'info' });
        setBarcodeInput(''); // Clear the input
        // Refocus after state updates settle
        setTimeout(() => inputRef.current?.focus(), 0);
        // Clear the message after a delay
        setTimeout(() => setSubmitStatus(null), 3000);
        return; // Stop further processing for this duplicate barcode
      }
    }

    // Original submission logic (if not a duplicate and not currently submitting)
    // Check conditions using latest values from refs and state
    // Only submit if:
    // 1. We are not currently submitting (using ref)
    // 2. This specific debounced value isn't the one already being submitted (using ref)
    if (!isSubmittingRef.current && submittedValueRef.current !== debouncedBarcode) {
      submitScan(debouncedBarcode);
    }
    // This effect should re-run when the debounced barcode or the scans list changes.
    // submitScan is stable due to useCallback with minimal dependencies.
  }, [debouncedBarcode, submitScan]); // Removed scans from dependency array

  // --- Query Handling ---
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQueryParams({ ...queryParams, [e.target.name]: e.target.value });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTrigger(prev => prev + 1); // Increment trigger to refetch
  };

  // --- Export Logic ---
  const handleExport = () => {
    if (!scans || scans.length === 0) {
      alert("没有数据可导出");
      return;
    }
    // Format data for worksheet
    const dataToExport = scans.map(scan => ({
        'ID': scan.id,
        '条码 (Barcode)': scan.barcode,
        '扫描时间 (Scanned At)': new Date(scan.scanned_at).toLocaleString('zh-CN') // Format for readability
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Scans");

    // Set column widths (optional, adjust as needed)
    worksheet['!cols'] = [ { wch: 5 }, { wch: 30 }, { wch: 25 } ];

    // Trigger download
    XLSX.writeFile(workbook, "scans_export.xlsx");
  };

  // --- Clear All Logic ---
  const handleClearAll = async () => {
    if (!window.confirm("确定要清空所有扫描记录吗？此操作无法撤销。")) {
      return;
    }

    setSubmitStatus({ message: "正在清空记录...", type: 'info' }); // Use info type for ongoing process

    try {
      const response = await fetch(`${API_BASE_URL}/scans/`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to clear records');
      }

      const result = await response.json();
      setSubmitStatus({ message: result.message || "记录已成功清空!", type: 'success' });
      mutate(); // Revalidate SWR data to show the empty table

    } catch (err: unknown) {
      console.error('Clear error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSubmitStatus({ message: `清空失败: ${errorMessage}`, type: 'error' });
    } finally {
      // Optionally clear the message after a delay
      setTimeout(() => setSubmitStatus(null), 5000);
    }
  };

  // --- Render ---
  return (
    <div className="container mx-auto p-4 font-sans">
      <h1 className="text-2xl font-bold mb-6 text-center">条码扫描管理系统</h1>

      {/* Barcode Input Section */}
      <div className="mb-6 p-4 border rounded shadow-md bg-white">
        <label htmlFor="barcode" className="block text-lg font-medium mb-2">扫描条码:</label>
        <input
          ref={inputRef} // Assign ref
          type="text"
          id="barcode"
          name="barcode"
          value={barcodeInput}
          onChange={(e) => setBarcodeInput(e.target.value)}
          placeholder="等待扫码枪输入..."
          className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
          autoFocus // Focus on load
          disabled={isSubmitting}
        />
        {isSubmitting && <p className="text-sm text-gray-500 mt-1">提交中...</p>}
        {submitStatus && (
          <p className={`text-sm mt-1 ${
            submitStatus.type === 'success' ? 'text-green-600' :
            submitStatus.type === 'error' ? 'text-red-600' :
            'text-blue-600' // Style for 'info'
          }`}>
            {submitStatus.message}
          </p>
        )}
      </div>

      {/* Query Section */}
      <div className="mb-6 p-4 border rounded shadow-md bg-white">
        <h2 className="text-xl font-semibold mb-4">查询记录</h2>
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium mb-1">开始日期:</label>
            <input
              type="datetime-local"
              id="startDate"
              name="startDate"
              value={queryParams.startDate}
              onChange={handleQueryChange}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium mb-1">结束日期:</label>
            <input
              type="datetime-local"
              id="endDate"
              name="endDate"
              value={queryParams.endDate}
              onChange={handleQueryChange}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label htmlFor="barcodeQuery" className="block text-sm font-medium mb-1">条码内容:</label>
            <input
              type="text"
              id="barcodeQuery"
              name="barcodeQuery"
              value={queryParams.barcodeQuery}
              onChange={handleQueryChange}
              placeholder="输入条码关键字..."
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="md:col-span-3 flex justify-end flex-wrap gap-2 mt-2"> {/* Added flex-wrap */}
             <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                查询
             </button>
             <button
                type="button"
                onClick={handleExport}
                disabled={isLoadingScans || !scans || scans.length === 0}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
             >
                导出 Excel
             </button>
             <button
                type="button"
                onClick={handleClearAll}
                className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                // Optionally disable if there are no scans to clear, though the confirmation handles this
                // disabled={!scans || scans.length === 0}
             >
                清空记录
             </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      <div className="mt-6 p-4 border rounded shadow-md bg-white">
        <h2 className="text-xl font-semibold mb-4">扫描结果</h2>
        {isLoadingScans && <p>加载中...</p>}
        {fetchError && <p className="text-red-500">加载错误: {fetchError.message}</p>}
        {!isLoadingScans && !fetchError && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">条码</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">扫描时间</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {scans && scans.length > 0 ? (
                  scans.map((scan) => (
                    <tr key={scan.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{scan.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{scan.barcode}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(scan.scanned_at).toLocaleString('zh-CN')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">无记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
