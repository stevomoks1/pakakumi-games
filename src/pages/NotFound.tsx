import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => (
  <div className="min-h-screen bg-[#111111] flex flex-col items-center justify-center text-white p-4">
    <h1 className="text-6xl font-black text-[#f58b2b] mb-4">404</h1>
    <p className="text-xl mb-8">Page Not Found</p>
    <Link to="/" className="bg-[#f58b2b] hover:bg-[#e07a20] text-white font-bold py-3 px-8 rounded transition-colors">
      GO HOME
    </Link>
  </div>
);

export default NotFound;
