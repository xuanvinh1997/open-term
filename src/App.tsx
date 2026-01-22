import { MainLayout } from "./components/layout/MainLayout";
import { Toaster } from "sonner";

function App() {
  return (
    <>
      <MainLayout />
      <Toaster position="bottom-right" richColors />
    </>
  );
}

export default App;
