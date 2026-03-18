import React from 'react';

const cards = [
  {
    title: '99.99% uptime Guarantee', 
    desc: 'Ahura Cloud guarantees 99.99% uptime speeds! We offer everything from 1Gbps to 40Gbps internet speeds to boost your loading time!',
    gradientFrom: '#5D23D3',
    gradientTo: '#1085F2',
  },
  {
    title: '24/7 Support',
    desc: 'Any time, any day, you can rely on our 24/7 Technical Support Team to quickly and expertly handle any IT issues with your server.',
    gradientFrom: '#5D23D3',
    gradientTo: '#1085F2',
  },
  {
    title: 'Diverse Server Hosting',
    desc: 'Our diverse international servers are located in Los Angeles, Denver, Chicago, and Amsterdam to cover all your server needs!',
    gradientFrom: '#5D23D3',
    gradientTo: '#1085F2',
  },
];

export default function FeatureSection() {
  return (
   <section className="select-none relative z-10 py-16 lg:py-24">
      <div className="flex justify-center items-center flex-wrap py-10 bg-[#AFAFAF]">
        {cards.map(({ title, desc, gradientFrom, gradientTo }, idx) => (
          <div
            key={idx}
            className="group relative w-[320px] h-[400px] m-[48px_52px] transition-all duration-500"
          >
            {/* Skewed gradient panels */}
            <span
              className="absolute top-[-10%] left-[50px] w-[73.333333%] h-[90%] rounded-lg transform skew-x-[15deg] transition-all duration-500 group-hover:skew-x-0 group-hover:left-[-25px] group-hover:w-[120%]"
              style={{
                background: `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})`,
              }}
            />
            <span
              className="absolute top-[-10%] left-[50px] w-[55%] h-[90%] rounded-lg transform skew-x-[15deg] blur-[30px] transition-all duration-500 group-hover:skew-x-0 group-hover:left-[-25px] group-hover:w-[120%]"
              style={{
                background: `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})`,
              }}
            />

            {/* Animated blurs */}
            <span className="pointer-events-none absolute inset-0 z-10">
              <span className="absolute top-0 left-0 w-0 h-0 rounded-full opacity-0 bg-[rgba(255,255,255,0.1)] backdrop-blur-[10px] shadow-[0_5px_15px_rgba(0,0,0,0.08)] transition-all duration-100 animate-blob group-hover:top-[-50px] group-hover:left-[50px] group-hover:w-[100px] group-hover:h-[100px] group-hover:opacity-100" />
              <span className="absolute bottom-0 right-0 w-0 h-0 rounded-full opacity-0 bg-[rgba(255,255,255,0.1)] backdrop-blur-[10px] shadow-[0_5px_15px_rgba(0,0,0,0.08)] transition-all duration-500 animate-blob animation-delay-1000 group-hover:bottom-[-50px] group-hover:right-[50px] group-hover:w-[100px] group-hover:h-[100px] group-hover:opacity-100" />
            </span>

            {/* Content */}
            <div className="relative z-20 left-0 w-[120%] p-[20px_40px] bg-[rgba(255,255,255,0.05)] backdrop-blur-[10px] shadow-lg rounded-lg text-black transition-all duration-500 group-hover:left-[-25px] group-hover:p-[60px_40px]">
              <h2 className="font-bold text-xl mb-2">{title}</h2>
              <p className="font-medium text-base leading-relaxed mb-2">{desc}</p>
              {/* <a
                href="#"
                className="inline-block text-lg font-bold text-black bg-white px-3 py-2 rounded hover:bg-[#ffcf4d] hover:border hover:border-[rgba(255,0,88,0.4)] hover:shadow-md"
              >
                Read More
              </a> */}
            </div>
          </div>
        ))}
      </div>

      {/* Tailwind custom utilities for animation and shadows */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translateY(10px); }
          50% { transform: translateY(-10px); }
        }
        .animate-blob { animation: blob 2s ease-in-out infinite; }
        .animation-delay-1000 { animation-delay: -1s; }
        .shadow-\[0_5px_15px_rgba\(0,0,0,0.08\) { box-shadow: 0 5px 15px rgba(0,0,0,0.08); }
      `}</style>
    </section>
  );
}
