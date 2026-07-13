export default function PageTitle({ title, buttonText, onButtonClick }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px",
      }}
    >
      <h2>{title}</h2>

      <button onClick={onButtonClick}>
        {buttonText}
      </button>
    </div>
  );
}