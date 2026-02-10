import { AppBar, Box, Button, Card, CardContent, Container, Grid, Stack, Toolbar, Typography } from '@mui/material';

const stats = [
  { label: 'Technicians Online', value: '128' },
  { label: 'Pending Sync', value: '14' },
  { label: 'Out of Range', value: '3' },
  { label: 'Rejected Today', value: '2' },
];

export default function App() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.100' }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Technician Attendance Admin
          </Typography>
          <Button color="inherit">Settings</Button>
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h5" fontWeight={600}>
              Live Overview
            </Typography>
            <Typography color="text.secondary">
              Offline-first sync status and attendance validation insights (Asia/Jakarta).
            </Typography>
          </Box>

          <Grid container spacing={2}>
            {stats.map((item) => (
              <Grid item xs={12} sm={6} md={3} key={item.label}>
                <Card sx={{ borderRadius: 3 }}>
                  <CardContent>
                    <Typography color="text.secondary" variant="body2">
                      {item.label}
                    </Typography>
                    <Typography variant="h4" fontWeight={700}>
                      {item.value}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Card sx={{ borderRadius: 3 }}>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    Latest Attendance Events
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Showing most recent check-ins and check-outs with selfie verification.
                  </Typography>
                </Box>
                <Button variant="contained">Export CSV</Button>
              </Stack>
              <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Connect the API to populate attendance streams, selfie previews, and audit log drill-downs.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
