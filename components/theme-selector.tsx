"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';

const THEME_STORAGE_KEY = 'wanwatch-theme-variant';

type ThemeVariant = 'default' | 'network-pulse' | 'signal' | 'monitor' | 'dracula';

interface ThemeOption {
  value: ThemeVariant;
  label: string;
  description: string;
  previewColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'default',
    label: 'Default Blue',
    description: 'Classic blue theme with professional appearance',
    previewColors: {
      primary: 'hsl(221.2, 83.2%, 53.3%)',
      secondary: 'hsl(210, 40%, 96.1%)',
      accent: 'hsl(210, 40%, 96.1%)',
    },
  },
  {
    value: 'network-pulse',
    label: 'Network Pulse',
    description: 'Cyan and teal tones inspired by network signals',
    previewColors: {
      primary: 'hsl(188, 94%, 43%)',
      secondary: 'hsl(186, 25%, 94%)',
      accent: 'hsl(162, 73%, 42%)',
    },
  },
  {
    value: 'signal',
    label: 'Signal',
    description: 'Green and amber colors inspired by status indicators',
    previewColors: {
      primary: 'hsl(142, 76%, 42%)',
      secondary: 'hsl(120, 15%, 94%)',
      accent: 'hsl(45, 93%, 47%)',
    },
  },
  {
    value: 'monitor',
    label: 'Monitor',
    description: 'Purple and blue gradient for a modern dashboard feel',
    previewColors: {
      primary: 'hsl(262, 83%, 58%)',
      secondary: 'hsl(260, 20%, 94%)',
      accent: 'hsl(142, 76%, 42%)',
    },
  },
  {
    value: 'dracula',
    label: 'Dracula',
    description: 'Dark purple and pink theme inspired by the Dracula color scheme',
    previewColors: {
      primary: 'hsl(265, 89%, 78%)',
      secondary: 'hsl(232, 14%, 31%)',
      accent: 'hsl(326, 100%, 74%)',
    },
  },
];

export function ThemeSelector() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeVariant>('default');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Fetch current theme preference
    const fetchTheme = async () => {
      try {
        const response = await fetch('/api/settings/theme');
        if (response.ok) {
          const data = await response.json();
          setSelectedTheme(data.themeVariant || 'default');
        }
      } catch (error) {
        console.error('Error fetching theme:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTheme();
  }, []);

  const handleThemeChange = async (value: string) => {
    const newTheme = value as ThemeVariant;
    setIsSaving(true);

    try {
      const response = await fetch('/api/settings/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ themeVariant: newTheme }),
      });

      if (response.ok) {
        setSelectedTheme(newTheme);

        // Apply theme immediately to the document
        document.documentElement.setAttribute('data-theme', newTheme);
        // Update localStorage cache for persistence across auth states
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);

        toast({
          title: 'Theme updated',
          description: 'Your theme preference has been saved.',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to save theme preference.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving theme:', error);
      toast({
        title: 'Error',
        description: 'Failed to save theme preference.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Loading theme preferences...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>
          Choose a color theme for your dashboard. The theme will apply to both light and dark modes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={selectedTheme}
          onValueChange={handleThemeChange}
          disabled={isSaving}
          className="space-y-4"
        >
          {THEME_OPTIONS.map((theme) => (
            <div
              key={theme.value}
              className="flex items-start space-x-3 space-y-0 rounded-md border p-4 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => !isSaving && handleThemeChange(theme.value)}
            >
              <RadioGroupItem value={theme.value} id={theme.value} className="mt-1" />
              <div className="flex-1">
                <Label
                  htmlFor={theme.value}
                  className="cursor-pointer font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {theme.label}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {theme.description}
                </p>
                <div className="flex gap-2 mt-3">
                  <div
                    className="w-8 h-8 rounded-md border shadow-xs"
                    style={{ backgroundColor: theme.previewColors.primary }}
                    title="Primary color"
                  />
                  <div
                    className="w-8 h-8 rounded-md border shadow-xs"
                    style={{ backgroundColor: theme.previewColors.secondary }}
                    title="Secondary color"
                  />
                  <div
                    className="w-8 h-8 rounded-md border shadow-xs"
                    style={{ backgroundColor: theme.previewColors.accent }}
                    title="Accent color"
                  />
                </div>
              </div>
            </div>
          ))}
        </RadioGroup>
        {isSaving && (
          <p className="text-sm text-muted-foreground mt-4">Saving theme preference...</p>
        )}
      </CardContent>
    </Card>
  );
}
