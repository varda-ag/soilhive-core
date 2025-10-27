import "../styles/Donation.css";

function Donation() {
  return (
    <iframe className="donation-page" src={`${import.meta.env.PUBLIC_FE_BACKEND_BASE_URL}/pages/donation?source=app`}></iframe>
  );
};

export default Donation;
