import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Activity, Shield } from 'lucide-react';
const Navbar = () => {
    return (_jsx("nav", { className: "bg-white shadow-md px-6 py-4", children: _jsxs("div", { className: "max-w-7xl mx-auto flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center space-x-3", children: [_jsx(Activity, { className: "h-8 w-8 text-blue-600" }), _jsx("h1", { className: "text-xl font-bold text-gray-800", children: "DR Detection System" })] }), _jsxs("div", { className: "flex items-center space-x-2 text-sm text-gray-600", children: [_jsx(Shield, { className: "h-4 w-4" }), _jsx("span", { children: "Professional Medical AI" })] })] }) }));
};
export default Navbar;
