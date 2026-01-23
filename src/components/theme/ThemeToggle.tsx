import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { VscColorMode } from "react-icons/vsc";
import { Button } from "@heroui/react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        isIconOnly
        size="sm"
        // variant="light"
        // radius="sm"
        className="text-neutral-400 hover:text-white data-[hover=true]:bg-white/10 w-6 h-6 min-w-6"
        aria-label="Toggle theme"
      >
        <VscColorMode size={16} />
      </Button>
    );
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      isIconOnly
      size="sm"
      // variant="light"
      // radius="sm"
      onPress={toggleTheme}
      className="text-neutral-400 hover:text-neutral-900 dark:hover:text-white data-[hover=true]:bg-black/10 dark:data-[hover=true]:bg-white/10 w-6 h-6 min-w-6"
      aria-label="Toggle theme"
    >
      <VscColorMode size={16} />
    </Button>
  );
}
