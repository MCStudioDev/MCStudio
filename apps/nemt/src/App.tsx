/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import DispatcherPortal from './pages/DispatcherPortal';
import DriverApp from './pages/DriverApp';
import PatientTracker from './pages/PatientTracker';
import AdminPanel from './pages/AdminPanel';
import DispatcherAuthWrapper from './components/DispatcherAuthWrapper';
import ErrorBoundary from './components/ErrorBoundary';
import { TenantProvider } from './contexts/TenantContext';

export default function App() {
  return (
    <ErrorBoundary>
      <TenantProvider>
        <BrowserRouter>
          <Routes>
            {/* Driver app - only needs name + PIN (no Firebase auth) */}
            <Route path="/driver/*" element={<DriverApp />} />
            
            {/* Patient tracker - public access */}
            <Route path="/patient/:tripId" element={<PatientTracker />} />
            
            {/* Dispatcher portal - requires Google sign-in */}
            <Route path="/dispatch/*" element={
              <DispatcherAuthWrapper>
                <DispatcherPortal />
              </DispatcherAuthWrapper>
            } />

            {/* Admin panel - requires Google sign-in + admin role */}
            <Route path="/admin/*" element={
              <DispatcherAuthWrapper>
                <AdminPanel />
              </DispatcherAuthWrapper>
            } />
            
            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/driver" replace />} />
          </Routes>
        </BrowserRouter>
      </TenantProvider>
    </ErrorBoundary>
  );
}
