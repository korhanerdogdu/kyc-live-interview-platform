import 'bootstrap-icons/font/bootstrap-icons.css';
import React from 'react';
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate
} from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

import PendingInterviews from './pages/PendingInterviews';
import LiveInterviewWrapper from './pages/LiveInterviewWrapper';

function App() {
    return (
        <Router>
                <Routes>
                    <Route path="/" element={<Navigate to="/pending-interview" replace />} />
                    <Route path="/pending-interview" element={<PendingInterviews />} />
                    <Route path="/live-interview/:id" element={<LiveInterviewWrapper />} />
                </Routes>
        </Router>
    );
}

export default App;
