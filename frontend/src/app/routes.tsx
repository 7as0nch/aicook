import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";

import { isAuthenticated } from "../lib/api/client";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Recipes from "./pages/Recipes";
import RecipeDetail from "./pages/RecipeDetail";
import RecipeEdit from "./pages/RecipeEdit";
import CookingMode from "./pages/CookingMode";
import Plan from "./pages/Plan";
import Shop from "./pages/Shop";
import Profile from "./pages/Profile";
import Preferences from "./pages/Preferences";
import KnowledgeBase from "./pages/KnowledgeBase";
import { RecipeWorkbenchPage } from "../features/recipes/RecipeWorkbenchPage";
import Auth from "./pages/Auth";

function RequireAuth({ children }: { children: ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/auth" replace />;
}

export const router = createBrowserRouter([
  {
    path: "/auth",
    Component: Auth,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, Component: Home },
      { path: "recipes", Component: Recipes },
      { path: "recipes/editor", Component: RecipeWorkbenchPage },
      { path: "recipes/:id/edit", Component: RecipeEdit },
      { path: "recipes/:id", Component: RecipeDetail },
      { path: "plan", Component: Plan },
      { path: "shop", Component: Shop },
      { path: "profile", Component: Profile },
      { path: "profile/preferences", Component: Preferences },
      { path: "profile/knowledge-base", Component: KnowledgeBase },
    ],
  },
  {
    path: "/cook/:id",
    element: (
      <RequireAuth>
        <CookingMode />
      </RequireAuth>
    ),
  },
]);
