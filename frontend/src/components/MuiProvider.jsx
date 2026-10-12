import React, { useMemo } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Slide from '@mui/material/Slide'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { useAppStore } from '../store/useAppStore'

function SlideTransition(props) {
  return <Slide {...props} direction="up" />
}

export default function MuiProvider({ children, themeMode = 'light' }) {
  const snackbar = useAppStore((state) => state.snackbar)
  const hideSnackbar = useAppStore((state) => state.hideSnackbar)

  const isDark = themeMode === 'dark' || themeMode === 'slate'

  const muiTheme = useMemo(() => {
    return createTheme({
      palette: {
        mode: isDark ? 'dark' : 'light',
        primary: {
          main: '#059669', // Emerald
          light: '#34d399',
          dark: '#047857',
          contrastText: '#ffffff',
        },
        secondary: {
          main: '#6366f1', // Royal Indigo
          light: '#818cf8',
          dark: '#4f46e5',
        },
        error: {
          main: '#ef4444',
        },
        warning: {
          main: '#f59e0b',
        },
        info: {
          main: '#0ea5e9',
        },
        success: {
          main: '#10b981',
        },
        background: {
          default: isDark ? '#0f172a' : '#f8fafc',
          paper: isDark ? '#1e293b' : '#ffffff',
        },
      },
      typography: {
        fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      },
      shape: {
        borderRadius: 8,
      },
      components: {
        MuiButton: {
          styleOverrides: {
            root: {
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 8,
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              fontWeight: 600,
              fontSize: '0.75rem',
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              backgroundColor: isDark ? '#334155' : '#0f172a',
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 500,
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            },
          },
        },
      },
    })
  }, [isDark])

  return (
    <ThemeProvider theme={muiTheme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        {children}

        {/* Global MUI Toast Notification Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={hideSnackbar}
          TransitionComponent={SlideTransition}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            onClose={hideSnackbar}
            severity={snackbar.severity || 'info'}
            variant="filled"
            sx={{
              width: '100%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              borderRadius: '10px',
              fontWeight: 500,
              fontSize: '0.875rem',
            }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

