const Footer = () => {
  return (
    <footer className="bg-gray-800 text-white py-6 mt-12">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <p className="text-sm">
          © 2024 DR Detection System | Built with React + FastAPI + PyTorch
        </p>
        <p className="text-xs text-gray-400 mt-2">
          QWK: 0.9083 | Accuracy: 82.56%
        </p>
      </div>
    </footer>
  );
};

export default Footer;