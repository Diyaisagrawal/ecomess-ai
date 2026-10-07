'use client';

import { useEffect, useState } from 'react';
import { useInventoryStore } from '@/store/inventoryStore';

export function InventorySection() {
  const { items, summary, alerts, loading, fetchInventory, fetchSummary, fetchAlerts } = useInventoryStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Grains',
    unit: 'kg',
    quantity: '',
    minThreshold: '',
    maxThreshold: '',
    unitCost: '',
  });

  useEffect(() => {
    fetchInventory();
    fetchSummary();
    fetchAlerts();
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    // Implementation for adding item
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Total Items</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{summary.totalItems}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Low Stock</h3>
            <p className="text-3xl font-bold text-orange-600 mt-2">{summary.lowStockCount}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Expiring Soon</h3>
            <p className="text-3xl font-bold text-red-600 mt-2">{summary.expiringCount}</p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <h3 className="font-semibold text-yellow-900 mb-3">Alerts ({alerts.length})</h3>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((alert, idx) => (
              <div key={idx} className="text-sm text-yellow-800">
                <strong>{alert.item}</strong>: {alert.type} (Current: {alert.currentValue})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Inventory</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Add Item
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No inventory items</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item) => {
                  let statusColor = 'text-green-600';
                  let status = 'OK';
                  
                  if (item.quantity < item.minThreshold) {
                    statusColor = 'text-red-600';
                    status = 'Low Stock';
                  } else if (item.quantity > item.maxThreshold) {
                    statusColor = 'text-orange-600';
                    status = 'Overstock';
                  }

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{item.category}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {item.quantity.toFixed(2)}
                      </td>
                      <td className={`px-6 py-4 text-sm font-medium ${statusColor}`}>
                        {status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}