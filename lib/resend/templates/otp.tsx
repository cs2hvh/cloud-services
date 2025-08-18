import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Text,
  Hr,
} from "@react-email/components";

interface OTPEmailProps {
  username: string;
  otp: string;
}

export const OTPEmail = ({ username, otp }: OTPEmailProps) => (
  <Html>
    <Head />
    <Preview>Your One-Time Password (OTP)</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={`${process.env.DOMAIN}/logo2.png`}
          width="42"
          height="42"
          alt="Linear"
          style={logo}
        />
        <Heading style={heading}>Hi {username},</Heading>
        <Text style={paragraph}>
          Use the following OTP to complete your registration:
        </Text>
        <Text style={otpStyle}>{otp}</Text>
        <Hr style={hr} />
        <Link href={`${process.env.DOMAIN}/support`} style={reportLink}>
          Need help?
        </Link>
      </Container>
    </Body>
  </Html>
);

export default OTPEmail;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0 48px",
  maxWidth: "560px",
};

const logo = {
  borderRadius: 21,
  width: 42,
  height: 42,
};

const heading = {
  fontSize: "24px",
  letterSpacing: "-0.5px",
  lineHeight: "1.3",
  fontWeight: "400",
  color: "#484848",
  padding: "17px 0 0",
};

const paragraph = {
  margin: "0 0 15px",
  fontSize: "15px",
  lineHeight: "1.4",
  color: "#3c4149",
};

const otpStyle = {
  fontSize: "28px",
  fontWeight: "bold",
  textAlign: "center" as const,
  margin: "20px 0",
  padding: "10px",
  backgroundColor: "#f0f0f0",
  letterSpacing: "2px",
};

const hr = {
  borderColor: "#dfe1e4",
  margin: "42px 0 26px",
};

const reportLink = {
  fontSize: "14px",
  color: "#b4becc",
};
