import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AppProvider } from "./ctx";
import { RootLayout } from "./routes/RootLayout";
import Home from "./routes/Home";
import { NotFound } from "./routes/NotFound";

const Leagues = lazy(() => import("./routes/Leagues"));
const LeaguePage = lazy(() => import("./routes/LeaguePage"));
const LeagueOverview = lazy(() => import("./routes/league/Overview"));
const LeagueShifts = lazy(() => import("./routes/league/Shifts"));
const LeagueChapters = lazy(() => import("./routes/league/Chapters"));
const LeagueMembers = lazy(() => import("./routes/league/Members"));
const LeagueResources = lazy(() => import("./routes/league/Resources"));
const LeagueImpact = lazy(() => import("./routes/league/Impact"));
const LeagueSteward = lazy(() => import("./routes/league/Steward"));
const LeagueSettings = lazy(() => import("./routes/league/Settings"));
const Dashboard = lazy(() => import("./routes/Dashboard"));
const LedgerPage = lazy(() => import("./routes/LedgerPage"));
const Login = lazy(() => import("./routes/Login"));
const Register = lazy(() => import("./routes/Register"));
const JoinInvite = lazy(() => import("./routes/JoinInvite"));

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<Home />} />
          <Route path="leagues" element={<Leagues />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="leagues/:id" element={<LeaguePage />}>
            <Route index element={<LeagueOverview />} />
            <Route path="shifts" element={<LeagueShifts />} />
            <Route path="chapters" element={<LeagueChapters />} />
            <Route path="members" element={<LeagueMembers />} />
            <Route path="resources" element={<LeagueResources />} />
            <Route path="impact" element={<LeagueImpact />} />
            <Route path="steward" element={<LeagueSteward />} />
            <Route path="settings" element={<LeagueSettings />} />
          </Route>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="join/:token" element={<JoinInvite />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
