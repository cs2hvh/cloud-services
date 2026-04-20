"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Headphones, HelpCircle, Search } from "lucide-react";

const faqData = [
  {
    value: "pay",
    question: "How do I pay with Crypto?",
    answer: "To pay using our payment system, you need to send the amount specified on the payment page to the wallet address indicated there.",
  },
  {
    value: "cryptocurrency",
    question: "Where can I get cryptocurrency for payment?",
    answer: "Please consider buying it on one of the convenient cryptocurrency exchanges.",
  },
  {
    value: "network",
    question: "What if I've selected the wrong network?",
    answer: "Unfortunately, it is not possible to change the network after it has been selected. To proceed, you need to create a new order on the store's website and select the desired network during checkout.",
  },
  {
    value: "timer",
    question: "Why has my transaction not been completed, but the timer on the payment page has expired?",
    answer: "Your transaction has not yet received the necessary confirmations from the network. You don't need to worry about the timer on the payment page.",
  },
  {
    value: "status",
    question: "Where can I check the status of my transaction?",
    answer: "Please track the status of the transaction in any Blockchain Explorer convenient for you. To do this, enter the transaction hash to get all the necessary information.",
  },
  {
    value: "credited",
    question: "My payment has not been credited, what should I do?",
    answer: "Different cryptocurrencies require a different number of confirmations, after receipt of which the funds will be credited automatically. If the payment was not credited immediately after receiving the required number of confirmations, please contact support.",
  },
];

export function FaqSheet() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFaqs = faqData.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <HelpCircle className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Frequently Asked Questions</SheetTitle>
          <SheetDescription>
            Find answers to common questions about ahurasense payments.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search FAQs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Accordion */}
          <Accordion type="multiple" className="w-full">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq) => (
                <AccordionItem key={faq.value} value={faq.value}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No FAQs found matching your search.
              </p>
            )}
          </Accordion>
        </div>
        <SheetFooter>
          <Button variant="default">
            <Headphones />
            Contact Support
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
