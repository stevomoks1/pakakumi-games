import React from 'react';
import AuthModal from '@/components/AuthModal';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
      <AuthModal 
        isOpen={true} 
        onClose={() => navigate('/')} 
        initialMode="login"
      />
    </div>
  );
};

export default Login;
