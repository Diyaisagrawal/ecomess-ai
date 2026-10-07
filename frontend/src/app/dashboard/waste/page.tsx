'use client';

import { WasteEntryForm } from '@/components/forms/WasteEntryForm';
import { WasteHistoryTable } from '@/components/tables/WasteHistoryTable';
import { useState } from 'react';

export default function WastePage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900">Waste Management</h1>
        <p className="text-gray-600 mt-2">Track and manage food waste</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          {showForm ? (
            <div>
              <button
                onClick={() => setShowForm(false)}
                className="mb-4 text-blue-600 hover:text-blue-900"
              >
                ← Hide Form
              </button>
              <WasteEntryForm onSuccess={() => setShowForm(false)} />
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 font-medium"
            >
              + New Waste Record
            </button>
          )}
        </div>

        <div className="lg:col-span-2">
          <WasteHistoryTable />
        </div>
      </div>
    </div>
  );
}