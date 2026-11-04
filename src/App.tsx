import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AppProvider } from "./ctx";
import { RootLayout } from "./routes/RootLayout";
import Home from "./routes/Home";
import { NotFound } from "./routes/NotFound";

const Leagues = lazy(() => import("./routes/Leagues"));
const LeaguePage = lazy(() => import("./routes/LeaguePage"));
const Dashboard = lazy(() => import("./routes/Dashboard"));
const Login = lazy(() => import("./routes/Login"));
const Register = lazy(() => import("./routes/Register"));

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<Home />} />
          <Route path="leagues" element={<Leagues />} />
          <Route path="leagues/:id" element={<LeaguePage />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
