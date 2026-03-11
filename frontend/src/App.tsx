import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppProvider } from "@/contexts/AppContext";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import Index from "./pages/Index";
import Tasks from "./pages/Tasks";
import CalendarPage from "./pages/CalendarPage";
import SleepPage from "./pages/SleepPage";
import MenuPage from "./pages/MenuPage";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import OnboardingSleepGoal from "./pages/OnboardingSleepGoal";
import Profile from "./pages/Profile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ThemeProvider>
        <AuthProvider>
          <AppProvider>
            <BrowserRouter>
              <AppLayout>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<Signup />} />
                  <Route
                    path="/onboarding/sleep-goal"
                    element={
                      <RequireAuth requireSleepSetup={false}>
                        <OnboardingSleepGoal />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/"
                    element={
                      <RequireAuth>
                        <Index />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/tasks"
                    element={
                      <RequireAuth>
                        <Tasks />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/calendar"
                    element={
                      <RequireAuth>
                        <CalendarPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/sleep"
                    element={
                      <RequireAuth>
                        <SleepPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <RequireAuth requireSleepSetup={false}>
                        <Profile />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/menu"
                    element={
                      <RequireAuth requireSleepSetup={false}>
                        <MenuPage />
                      </RequireAuth>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppLayout>
            </BrowserRouter>
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);
export default App;
