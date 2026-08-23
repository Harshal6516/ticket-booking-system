import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Toast from './components/Toast';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import SeatMapPage from './pages/SeatMapPage';
import BookingsPage from './pages/BookingsPage';
import WaitlistPage from './pages/WaitlistPage';
import OfferPage from './pages/OfferPage';
import AdminVenuesPage from './pages/AdminVenuesPage';
import OrgDashboardPage from './pages/OrgDashboardPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-bg">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<EventsPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/events/:id" element={<EventDetailPage />} />
              <Route path="/events/:eventId/shows/:showId/seats" element={<SeatMapPage />} />
              <Route path="/bookings" element={<BookingsPage />} />
              <Route path="/waitlist" element={<WaitlistPage />} />
              <Route path="/offers/:token" element={<OfferPage />} />
              <Route path="/admin/venues" element={<AdminVenuesPage />} />
              <Route path="/organiser/dashboard" element={<OrgDashboardPage />} />
            </Routes>
          </main>
          <Toast />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
