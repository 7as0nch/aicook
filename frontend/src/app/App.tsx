import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AIProvider } from "./contexts/AIContext";
import AIAssistant from "./components/AIAssistant";

export default function App() {
  return (
    <AIProvider>
      <RouterProvider router={router} />
      <AIAssistant />
    </AIProvider>
  );
}
