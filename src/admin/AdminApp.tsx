import { Routes, Route, Navigate } from "react-router-dom";
import { AdminAuthProvider } from "@/admin/auth";
import AdminLayout from "@/admin/Layout";
import AdminLogin from "@/admin/Login";
import AdminDashboard from "@/admin/pages/Dashboard";
import AdminAnalytics from "@/admin/pages/Analytics";
import AdminProducts from "@/admin/pages/Products";
import AdminCategories from "@/admin/pages/Categories";
import AdminInventory from "@/admin/pages/Inventory";
import AdminOrders from "@/admin/pages/Orders";
import AdminCustomers from "@/admin/pages/Customers";
import AdminLeads from "@/admin/pages/Leads";
import AdminContent from "@/admin/pages/Content";
import AdminMedia from "@/admin/pages/Media";
import AdminSettings from "@/admin/pages/Settings";

/**
 * WOODEX admin — mounted at /admin/*.
 *
 * Self-contained: own auth context, own layout, no storefront chrome.
 * Data comes from the adapter factory (demo DB or Bagisto REST) — see src/api.
 */
export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="leads" element={<AdminLeads />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="media" element={<AdminMedia />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
