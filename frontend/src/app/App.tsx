import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AIProvider } from "./contexts/AIContext";

export default function App() {
  return (
    <AIProvider>
      <RouterProvider router={router} />
    </AIProvider>
  );
}
