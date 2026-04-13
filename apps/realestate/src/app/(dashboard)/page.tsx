"use client";

import { Building2 } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Your Listings</h2>
        
        <div className="px-6 py-12 text-center flex flex-col items-center text-gray-500">
          <Building2 className="h-16 w-16 text-blue-200 mb-4" />
          <p>No active listings found!</p>
          <p className="text-sm mt-2">Generate a post to create your first listing entry.</p>
        </div>
      </div>
    </div>
  );
}
