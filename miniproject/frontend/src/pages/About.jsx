import { Cloud, Users, Target, Lightbulb, Mail, Phone, MapPin, Calendar } from 'lucide-react';

export function About() {
  const features = [
    {
      icon: <Cloud className="w-8 h-8" />,
      title: 'Real-time Monitoring',
      description: 'Access live weather data from our campus weather station with updates every 5 minutes.'
    },
    {
      icon: <Target className="w-8 h-8" />,
      title: 'Accurate Forecasts',
      description: 'Get precise 7-day weather forecasts specifically tailored for our campus location.'
    },
    {
      icon: <Lightbulb className="w-8 h-8" />,
      title: 'Smart Alerts',
      description: 'Receive timely notifications about severe weather conditions and important updates.'
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: 'Community Focus',
      description: 'Weather information designed for students, faculty, and staff to plan their campus activities.'
    }
  ];

  const stats = [
    { value: '24/7', label: 'Monitoring' },
    { value: '5min', label: 'Update Interval' },
    { value: '15+', label: 'Data Points' },
    { value: '2024', label: 'Established' }
  ];

  const team = [
    { name: 'Department of Electronics', role: 'Station Management' },
    { name: 'Student Research Team', role: 'Data Analysis' },
    { name: 'IT Department', role: 'Web Development' },
    { name: 'Faculty Advisors', role: 'Technical Guidance' }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="text-center mb-12">
        <div className="flex justify-center mb-4">
          {/* Rajagiri logo – same asset as Header.jsx (public/rajagiri-logo.png) */}
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-4">
            <img
              src="/rajagiri-logo.png"
              alt="Rajagiri School of Engineering & Technology"
              className="w-20 h-20 rounded-full object-cover"
            />
          </div>
        </div>
        <h2 className="text-white mb-4">RSET Weather Station</h2>
        <p className="text-white/90 max-w-3xl mx-auto text-lg">
          Welcome to the official weather monitoring station of Rajagiri School of Engineering & Technology.
          Our mission is to provide accurate, real-time weather information to enhance campus life and support
          academic research.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 text-center shadow-lg border border-white/10"
          >
            <p className="text-white text-4xl mb-2">{stat.value}</p>
            <p className="text-white/70">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Mission Statement */}
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-lg border border-white/10">
        <h3 className="text-white mb-4">Our Mission</h3>
        <p className="text-white/90 leading-relaxed mb-4">
          The RSET Weather Station serves as a comprehensive resource for weather monitoring and
          environmental studies. We aim to provide the campus community with reliable weather data
          that helps in planning daily activities, conducting research, and understanding local
          climate patterns.
        </p>
        <p className="text-white/90 leading-relaxed">
          Our automated weather station collects data on temperature, humidity, wind speed,
          atmospheric pressure, and rainfall, contributing to both practical campus needs and
          academic learning opportunities.
        </p>
      </div>

      {/* Features Grid */}
      <div>
        <h3 className="text-white mb-6 text-center">Key Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-white/10"
            >
              <div className="bg-white/10 rounded-full p-3 inline-block mb-4 text-white">
                {feature.icon}
              </div>
              <h4 className="text-white mb-2">{feature.title}</h4>
              <p className="text-white/80">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Team Section */}
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-lg border border-white/10">
        <h3 className="text-white mb-6">Our Team</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {team.map((member, index) => (
            <div key={index} className="flex items-center gap-3 bg-white/10 rounded-xl p-4">
              <Users className="w-6 h-6 text-white/80" />
              <div>
                <p className="text-white">{member.name}</p>
                <p className="text-white/60 text-sm">{member.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 shadow-lg border border-white/10">
        <h3 className="text-white mb-6">Contact Us</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <MapPin className="w-6 h-6 text-white/80 flex-shrink-0 mt-1" />
            <div>
              <p className="text-white">Rajagiri School of Engineering & Technology</p>
              <p className="text-white/70">Rajagiri Valley, Kakkanad, Kochi - 682039</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="w-6 h-6 text-white/80" />
            <p className="text-white">weather@rset.edu.in</p>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="w-6 h-6 text-white/80" />
            <p className="text-white">+91 484 2660 999</p>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-white/80" />
            <p className="text-white">Operational: Monday - Saturday, 8:00 AM - 6:00 PM</p>
          </div>
        </div>
      </div>

      {/* Footer Note */}
      <div className="text-center text-white/70 pt-4">
        <p>Data is collected and maintained by the RSET Department of Electronics & Communication</p>
        <p className="text-sm mt-2">For research inquiries and data access, please contact our team</p>
      </div>
    </div>
  );
}
