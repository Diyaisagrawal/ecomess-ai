'use client';

import { useState } from 'react';
import { useWasteStore } from '@/store/wasteStore';

interface WasteEntryFormProps {
  onSuccess?: () => void;
}

export function WasteEntryForm({ onSuccess }: WasteEntryFormProps) {
  const { createRecord, loading, error } = useWasteStore();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    foodItem: '',
    category: 'PLATE_WASTE',
    quantityWasted: '',
    quantityPrepared: '',
    reason: '',
    mealType: 'LUNCH',
  });

  const categories = [
    { value: 'PREPARATION_LOSS', label: 'Preparation Loss' },
    { value: 'SPOILAGE', label: 'Spoilage' },
    { value: 'PLATE_WASTE', label: 'Plate Waste' },
    { value: 'EXPIRY_WASTE', label: 'Expiry Waste' },
    { value: 'OTHER', label: 'Other' },
  ];

  const mealTypes = [
    { value: 'BREAKFAST', label: 'Breakfast' },
    { value: 'LUNCH', label: 'Lunch' },
    { value: 'DINNER', label: 'Dinner' },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.foodItem || !formData.quantityWasted) {
      alert('Please fill all required fields');
      return;
    }

    try {
      await createRecord({
        ...formData,
        quantityWasted: parseFloat(formData.quantityWasted),
        quantityPrepared: formData.quantityPrepared ? parseFloat(formData.quantityPrepared) : null,
      });

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        foodItem: '',
        category: 'PLATE_WASTE',
        quantityWasted: '',
        quantityPrepared: '',
        reason: '',
        mealType: 'LUNCH',
      });

      onSuccess?.();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
      <h2 className="text-2xl font-bold text-gray-900">Record Food Waste</h2>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Meal Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Meal Type</label>
          <select
            name="mealType"
            value={formData.mealType}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {mealTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Food Item */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Food Item *</label>
          <input
            type="text"
            name="foodItem"
            placeholder="e.g., Rice, Dal, Vegetables"
            value={formData.foodItem}
            onChange={handleChange}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Waste Category</label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quantity Wasted */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Quantity Wasted (kg) *</label>
          <input
            type="number"
            name="quantityWasted"
            placeholder="0.0"
            step="0.1"
            value={formData.quantityWasted}
            onChange={handleChange}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Quantity Prepared */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Quantity Prepared (kg)</label>
          <input
            type="number"
            name="quantityPrepared"
            placeholder="0.0"
            step="0.1"
            value={formData.quantityPrepared}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Reason (Optional)</label>
        <textarea
          name="reason"
          placeholder="Why was this food wasted?"
          value={formData.reason}
          onChange={handleChange}
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
      >
        {loading ? 'Recording...' : 'Record Waste'}
      </button>
    </form>
  );
}