import { useState, useEffect } from "react"
import Navbar from "./component/Navbar"
import Home from "./pages/Home"
import Map from "./pages/MapView"
import Report from "./pages/Report"
import Dashboard from "./pages/Dashboard"
import LiveDetect from "./pages/LiveDetect"
import { Toaster } from "react-hot-toast"
import { BrowserRouter as Router, Routes, Route, Outlet, useLocation } from "react-router-dom";



function MainLayout() {
  const [activeSection, setActiveSection] = useState("/home")
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname === '/' ? '/home' : location.pathname;
    setActiveSection(path);
  }, [location.pathname]);

  return (
    <>
      <Navbar activeSection={activeSection} setActiveSection={setActiveSection}/>
      <Toaster position="top-center" reverseOrder={false} />
      <Outlet />
    </>
  );
}


function AppContent() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Home />} />
        <Route path="home" element={<Home />} />
        <Route path="map" element={<Map />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="report" element={<Report />} />
        <Route path="live" element={<LiveDetect />} />
      </Route>
    </Routes>
  )
}

function App() {

  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
