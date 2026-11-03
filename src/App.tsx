import { Route, Routes } from "react-router-dom";
import { AppLayout, AuthLayout } from "./components/Layout";
import { AssistantPage, DashboardPage, ExplorerPage, LandingPage, PaperDetailsPage, ProfilePage, ResearcherPage, SavedPage, TrendsPage, UtilityPage, WorkspacesPage } from "./pages/Pages";
import { AuthPage } from "./pages/AuthPage";

export default function App() {
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route element={<AuthLayout />}><Route path="/login" element={<AuthPage mode="login" />} /><Route path="/register" element={<AuthPage mode="register" />} /></Route>
    <Route element={<AppLayout />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/papers" element={<ExplorerPage kind="papers" />} />
      <Route path="/papers/:id" element={<PaperDetailsPage />} />
      <Route path="/researchers" element={<ExplorerPage kind="researchers" />} />
      <Route path="/researchers/:id" element={<ResearcherPage />} />
      <Route path="/trends" element={<TrendsPage />} />
      <Route path="/assistant" element={<AssistantPage />} />
      <Route path="/analyzer" element={<UtilityPage type="analyzer" />} />
      <Route path="/network" element={<UtilityPage type="network" />} />
      <Route path="/saved" element={<SavedPage />} />
      <Route path="/workspace" element={<WorkspacesPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<UtilityPage type="settings" />} />
      <Route path="*" element={<UtilityPage type="notFound" />} />
    </Route>
  </Routes>;
}
