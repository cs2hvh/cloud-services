'use client';

import { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';

type BillingCycle = 'monthly' | 'yearly';

interface PricingPlan {
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  buttonText: string;
  featured?: boolean;
}

const pricingPlans: PricingPlan[] = [
  {
    name: 'Free',
    description: 'Everything you need to supercharge your productivity.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      '100 messages/day',
      'Anurademe Flash model',
      'Basic Support',
      'Community Access',
    ],
    buttonText: 'Get Started',
  },
  {
    name: 'Pro',
    description: 'Unlock a new level of your personal productivity.',
    monthlyPrice: 20,
    yearlyPrice: 16, // Discounted yearly price (e.g., $192/year = $16/month)
    features: [
      'Unlimited messages',
      'All models including Pro',
      'Priority support',
      'API Access',
      'Custom instructions',
      '200K Context',
      'Developer tools',
    ],
    buttonText: 'Get Started',
    featured: true,
  },
  {
    name: 'Enterprise',
    description: 'Everything you need to supercharge your productivity.',
    monthlyPrice: 0, // Custom pricing
    yearlyPrice: 0,
    features: [
      'Everything in Free',
      'Unlimited Shared Commands',
      'Unlimited Shared Quickfires',
      'Priority support',
    ],
    buttonText: 'Contact Us',
  },
];

export default function ServicesHomeSectionFour2() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  return (
    <section 
      className="w-full py-16 md:py-24 lg:py-32 px-4 bg-cover bg-center bg-no-repeat" 
      style={{ 
        backgroundColor: '#1d1d1d',
        backgroundImage: 'url(/images/main-page/service-home-section-4-bg.svg)'
      }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-8">
            Choose Your Perfect <span className="text-[#4A90E2]">Plan</span>
          </h2>

          {/* Billing Toggle */}
          <div className="inline-flex items-center gap-2 p-1 rounded-lg bg-[#2a2a2b]">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`cursor-pointer px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                billingCycle === 'monthly'
                  ? 'bg-[#3a3a3b] text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`cursor-pointer px-6 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                billingCycle === 'yearly'
                  ? 'bg-[#3a3a3b] text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {pricingPlans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 transition-all duration-300 hover:scale-[1.1] lg:h-[543px] ${
                plan.featured
                  ? 'ring-2 ring-[#4A90E2] shadow-2xl shadow-[#4A90E2]/20'
                  : 'ring-2 ring-[#8d8f92] shadow-2xl shadow-[#8d8f92]/20'
              }`}
              style={{ backgroundColor: '#1b1b1c' }}
            >
              {/* Plan Name */}
              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>

              {/* Description */}
              <p className="text-white text-sm mb-6">{plan.description}</p>

              {/* Price */}
              <div className="mb-8">
                {plan.name === 'Enterprise' ? (
                  <div className="text-3xl md:text-4xl font-bold text-white">Custom</div>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl md:text-4xl font-bold text-white">
                      ${billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice}
                    </span>
                    {plan.monthlyPrice > 0 && (
                      <>
                        <span className="text-white text-sm">/ month</span>
                       
                      </>
                    )}
                    {plan.monthlyPrice === 0 && (
                      <span className="text-white text-sm">/ month</span>
                    )}
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="mb-8">
                <p className="text-sm font-semibold text-white mb-4">What&apos;s included</p>
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                     {
                      plan.name==='Pro'?
                      (
                         <div className="flex-shrink-0 w-5 h-5 rounded-full bg-white flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-black" />
                      </div>

                      ):
                      (
                         <div className="flex-shrink-0 w-5 h-5 rounded-full border border-white bg-white/10 flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                      )
                     }
                      <span className="text-white text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA Button */}
              <button
              className='cursor-pointer bg-[#0c2f3c] hover:bg-[#3a3a3b] text-white w-full py-3 px-6 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 group'
              >
                {plan.buttonText}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.cdnfonts.com/css/sk-modernist');
        
        * {
          font-family: 'SK Modernist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
      `}</style>
    </section>
  );
}
