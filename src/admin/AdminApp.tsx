import { Routes, Route, Navigate } from "react-router-dom";
import { AdminAuthProvider } from "@/admin/auth";
import AdminLayout from "@/admin/Layout";
import AdminLogin from "@/admin/Login";
import AdminDashboard from "@/admin/pages/Dashboard";
import AdminAnalytics from "@/admin/pages/Analytics";
import AdminProducts from "@/admin/pages/Products";
import AdminCategories from "@/admin/pages/Categories";
import AdminCollections from "@/admin/pages/Collections";
import AdminMaterials from "@/admin/pages/Materials";
import AdminProjects from "@/admin/pages/Projects";
import AdminPriceLists from "@/admin/pages/PriceLists";
import AdminBundles from "@/admin/pages/Bundles";
import AdminSalesChannels from "@/admin/pages/SalesChannels";
import AdminBulkEditor from "@/admin/pages/BulkEditor";
import AdminInventory from "@/admin/pages/Inventory";
import AdminOrders from "@/admin/pages/Orders";
import AdminDrafts from "@/admin/pages/Drafts";
import AdminQuotes from "@/admin/pages/Quotes";
import AdminSuppliers from "@/admin/pages/Suppliers";
import AdminPurchaseOrders from "@/admin/pages/PurchaseOrders";
import AdminTransfers from "@/admin/pages/Transfers";
import AdminQuote from "@/admin/pages/Quote";
import AdminReturns from "@/admin/pages/Returns";
import AdminExchanges from "@/admin/pages/Exchanges";
import AdminClaims from "@/admin/pages/Claims";
import AdminInvoice from "@/admin/pages/Invoice";
import AdminCustomers from "@/admin/pages/Customers";
import AdminLeads from "@/admin/pages/Leads";
import AdminContent from "@/admin/pages/Content";
import AdminBlog from "@/admin/pages/Blog";
import AdminServices from "@/admin/pages/Services";
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
        {/* chrome-free printable invoice — standalone, outside the admin layout, guarded inside */}
        <Route path="invoice/:id" element={<AdminInvoice />} />
        {/* chrome-free printable quotation — same pattern */}
        <Route path="quote/:id" element={<AdminQuote />} />
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="collections" element={<AdminCollections />} />
          <Route path="materials" element={<AdminMaterials />} />
          <Route path="projects" element={<AdminProjects />} />
          <Route path="price-lists" element={<AdminPriceLists />} />
          <Route path="bundles" element={<AdminBundles />} />
          <Route path="sales-channels" element={<AdminSalesChannels />} />
          <Route path="bulk-editor" element={<AdminBulkEditor />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="drafts" element={<AdminDrafts />} />
          <Route path="quotes" element={<AdminQuotes />} />
          <Route path="suppliers" element={<AdminSuppliers />} />
          <Route path="purchase-orders" element={<AdminPurchaseOrders />} />
          <Route path="transfers" element={<AdminTransfers />} />
          <Route path="returns" element={<AdminReturns />} />
          <Route path="exchanges" element={<AdminExchanges />} />
          <Route path="claims" element={<AdminClaims />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="leads" element={<AdminLeads />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="blog" element={<AdminBlog />} />
          <Route path="content" element={<AdminContent />} />
          <Route path="media" element={<AdminMedia />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Route>
      </Routes>
    </AdminAuthProvider>
  );
}
