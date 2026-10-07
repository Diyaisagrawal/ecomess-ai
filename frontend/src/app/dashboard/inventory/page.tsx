'use client';

import { InventorySection } from '@/components/sections/InventorySection';

export default function InventoryPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900">Inventory Management</h1>
        <p className="text-gray-600 mt-2">Manage food inventory and stock levels</p>
      </div>

      <InventorySection />
    </div>
  );
}