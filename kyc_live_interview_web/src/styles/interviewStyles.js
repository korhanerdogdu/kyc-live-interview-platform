export const interviewStyles = `
  .icon-button {
    opacity: 0.65;
    transition: opacity 0.3s ease, background-color 0.3s ease, color 0.3s ease;
  }
  .icon-button:hover {
    opacity: 1;
    background-color: white;
  }
  .icon-button:hover i {
    color: black;
  }e
  .btn-danger.icon-button:hover {
    background-color: #dc3545;
  }
  .btn-danger.icon-button:hover i {
    color: white;
  }
.btn-tt { position: relative; }
.btn-tt::after {
  content: attr(data-title);
  position: absolute;
  left: 50%;
  bottom: 58px;              
  transform: translateX(-50%);
  white-space: nowrap;
  background: rgba(33,37,41,.95);
  color: #fff;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  transition: opacity .08s ease; 
}
.btn-tt:hover::after, .btn-tt:focus-visible::after { opacity: 1; }
`;